import 'server-only';
import type { User } from '@prisma/client';
import { db, type Tx } from './db';
import { Fail, str } from './act';
import { audit } from './auth';
import { take } from './stock-reserve';
import { fmtDT } from '@/lib/domain';

// After-sales by serial number (B's half of claims): who bought this unit, is it under warranty, and swap it
// for a new one from stock. The claim workflow (person A) calls `replaceUnit` when a claim is approved.
// Serial statuses: in_stock → sold → claim (defective, back at the shop) → returned (sent back to the supplier); in_stock → scrapped (written off, stock-adjust.ts).

type Staff = Pick<User, 'id' | 'name' | 'role'>;
const norm = (s: string) => str(s).toUpperCase();

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

export async function lookupSerial(raw: string) {
  const serial = norm(raw);
  if (!serial) return null;
  const s = await db.serialNumber.findUnique({
    where: { serial },
    include: { item: { select: { sku: true, name: true, warrantyMonths: true } }, orderLine: { include: { order: { include: { customer: { select: { name: true, email: true, phone: true } } } } } } },
  });
  if (!s) return null;
  const o = s.orderLine?.order;
  const start = o?.shippedAt ?? o?.paidAt ?? null;
  const until = start ? addMonths(start, s.item.warrantyMonths) : null;
  const history = await db.auditLog.findMany({ where: { cat: { in: ['warranty', 'order'] }, OR: [{ target: serial }, { detail: { contains: serial } }] }, orderBy: [{ t: 'asc' }, { id: 'asc' }] });
  // A customer's open claim on this unit (person A's claims): the swap then belongs on the claim page
  const openClaim = (await db.claim.findFirst({ where: { serial, status: { in: ['submitted', 'received'] } }, select: { id: true } }))?.id ?? null;
  const spares = s.status === 'sold' ? await db.serialNumber.findMany({ where: { sku: s.sku, status: 'in_stock' }, orderBy: { createdAt: 'asc' }, take: 20, select: { serial: true } }) : [];
  return {
    serial: s.serial, status: s.status, sku: s.item.sku, name: s.item.name, warrantyMonths: s.item.warrantyMonths, receivedRef: s.receivedRef,
    orderId: o?.id ?? null, customer: o?.customer ?? null, soldText: start ? fmtDT(start) : '', untilText: until ? fmtDT(until) : '',
    inWarranty: !!until && until > new Date(),
    spares: spares.map(x => x.serial), openClaim,
    history: history.map(h => ({ id: String(h.id), tText: fmtDT(h.t), action: h.action, by: h.by, detail: h.detail })),
  };
}
export type SerialInfo = NonNullable<Awaited<ReturnType<typeof lookupSerial>>>;

/** Swap a sold unit under warranty for `newRaw` from stock. The new unit leaves stock (it can't be one held for an order);
 *  the old one comes back as `claim` and is not sellable. Both stay linked to the customer's order line.
 *  Pass `inTx` to make the swap part of the caller's transaction (claims: close the claim and swap together,
 *  so a claim can never end rejected with the unit already swapped). */
export async function replaceUnit(me: Staff, oldRaw: string, newRaw: string, noteIn: string, inTx?: Tx) {
  const oldS = norm(oldRaw), newS = norm(newRaw), note = str(noteIn).slice(0, 300);
  if (!note) throw new Fail('กรุณาระบุอาการเสีย / เลขที่เคลม');
  if (!newS) throw new Fail('กรุณาสแกน Serial ของเครื่องใหม่');
  if (oldS === newS) throw new Fail('Serial เครื่องใหม่ต้องไม่ซ้ำกับเครื่องเดิม');
  const info = await lookupSerial(oldS);
  if (!info) throw new Fail('ไม่พบ Serial นี้');
  if (info.status !== 'sold' || !info.orderId) throw new Fail('เปลี่ยนได้เฉพาะเครื่องที่ขายให้ลูกค้าแล้ว');
  if (!info.inWarranty) throw new Fail(`หมดประกันแล้ว (ถึง ${info.untilText})`);

  const swap = async (tx: Tx) => {
    const old = await tx.serialNumber.findUniqueOrThrow({ where: { serial: oldS } });
    const n = await tx.serialNumber.updateMany({ where: { serial: newS, sku: old.sku, status: 'in_stock' }, data: { status: 'sold', orderLineId: old.orderLineId } });
    if (n.count !== 1) throw new Fail(`Serial ${newS} ไม่ใช่ ${info.name} ที่อยู่ในสต็อก`);
    if (!(await take(tx, old.sku, 1))) throw new Fail(`${info.name} ในสต็อกถูกจองให้คำสั่งซื้ออื่นหมดแล้ว`);
    const o = await tx.serialNumber.updateMany({ where: { serial: oldS, status: 'sold' }, data: { status: 'claim' } });
    if (o.count !== 1) throw new Fail('สถานะเครื่องเดิมเปลี่ยนไปแล้ว — ลองใหม่');
    await tx.stockMove.create({ data: { sku: old.sku, type: 'out', qty: 1, ref: `เคลม ${info.orderId}`, by: me.name } });
    await audit(tx, me, 'warranty', 'เปลี่ยนสินค้าตามประกัน', oldS, `${info.name} · เครื่องเดิม ${oldS} → เครื่องใหม่ ${newS} · คำสั่งซื้อ ${info.orderId} · ${note}`);
  };
  if (inTx) await swap(inTx); else await db.$transaction(swap);
}

/** A defective unit goes back to the supplier (RMA). */
export async function returnToSupplier(me: Staff, raw: string, refIn: string) {
  const serial = norm(raw), ref = str(refIn).slice(0, 100);
  if (!ref) throw new Fail('กรุณาระบุเลขที่ใบส่งคืน / RMA');
  await db.$transaction(async tx => {
    const r = await tx.serialNumber.updateMany({ where: { serial, status: 'claim' }, data: { status: 'returned' } });
    if (r.count !== 1) throw new Fail('ส่งคืนผู้ขายได้เฉพาะเครื่องที่รับเคลมไว้');
    await audit(tx, me, 'warranty', 'ส่งเครื่องเสียคืนผู้ขาย', serial, ref);
  });
}
