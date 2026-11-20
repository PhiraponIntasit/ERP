'use server';
import { adjustStock, inStockSerials } from '../stock-adjust';
import { Prisma } from '@prisma/client';
import { db, nextSeq, num, type Tx } from '../db';
import { audit, requireAction } from '../auth';
import { act, Fail, int, str } from '../act';
import { baht, bahtS, canDecide, config, DISPLAY_TZ, PR_SEE_ALL, VAT } from '@/lib/domain';

// ── serial numbers ──

const SERIAL_RE = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;

/** The serials typed or scanned for `n` units of `name`: trimmed, upper-cased, one per unit, no repeats. */
function readSerials(raw: string[] | undefined, n: number, name: string): string[] {
  const list = (raw ?? []).map(x => str(x).toUpperCase()).filter(Boolean);
  if (list.length !== n) throw new Fail(`${name}: ต้องสแกน Serial ${n} ชิ้น (ได้ ${list.length})`);
  const bad = list.find(x => !SERIAL_RE.test(x));
  if (bad) throw new Fail(`Serial "${bad}" ไม่ถูกต้อง (A–Z, 0–9, . _ / - ยาว 3–64 ตัว)`);
  const dup = list.find((x, i) => list.indexOf(x) !== i);
  if (dup) throw new Fail(`Serial ${dup} ซ้ำกันในรายการ`);
  return list;
}

/** Record received units by serial; refuses a serial the shop has already seen. */
async function addSerials(tx: Tx, sku: string, serials: string[], ref: string) {
  if (!serials.length) return;
  const seen = await tx.serialNumber.findMany({ where: { serial: { in: serials } }, select: { serial: true } });
  if (seen.length) throw new Fail(`Serial ${seen.map(x => x.serial).join(', ')} มีในระบบแล้ว`);
  await tx.serialNumber.createMany({ data: serials.map(serial => ({ serial, sku, receivedRef: ref })) });
}

// ── inventory (managing stock requires the "purchase" permission, as in the design) ──

export async function receiveStock(sku: string, rawQty: string, rawNote: string, rawSerials?: string[]) {
  return act(async () => {
    const me = await requireAction('purchase');
    const qty = int(rawQty), note = str(rawNote).slice(0, 200);
    const it = await db.inventoryItem.findUnique({ where: { sku } });
    if (!it) throw new Fail('กรุณาเลือกสินค้า');
    if (!(qty > 0)) throw new Fail('จำนวนต้องมากกว่า 0');
    const serials = it.serialTracked ? readSerials(rawSerials, qty, it.name) : [];
    await db.$transaction(async tx => {
      const cur = await tx.inventoryItem.update({ where: { sku }, data: { qty: { increment: qty } } });
      await tx.stockMove.create({ data: { sku, type: 'in', qty, ref: note || 'รับเข้าด้วยตนเอง', by: me.name } });
      await addSerials(tx, sku, serials, note || 'รับเข้าด้วยตนเอง');
      await audit(tx, me, 'stock', 'รับเข้าสต็อก', sku, `${it.name} +${qty} · คงเหลือ ${cur.qty - qty} → ${cur.qty}` + (note ? ' · ' + note : ''));
    });
    return `รับ ${it.name} เข้าคลัง ${qty} ${it.unit} แล้ว`;
  });
}

export async function addItem(f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('purchase');
    const sku = str(f.sku).toUpperCase(), name = str(f.name);
    if (!sku || !name) throw new Fail('กรุณากรอก SKU และชื่อสินค้า');
    if (!/^[A-Z0-9._-]{1,32}$/.test(sku)) throw new Fail('SKU ใช้ได้เฉพาะ A–Z, 0–9, . _ -');
    if (await db.inventoryItem.findUnique({ where: { sku } })) throw new Fail('SKU นี้มีอยู่แล้ว');
    const qty = Math.max(0, int(f.qty) || 0), min = Math.max(0, int(f.min) || 0), cost = Math.max(0, parseFloat(str(f.cost)) || 0);
    await db.$transaction(async tx => {
      await tx.inventoryItem.create({ data: { sku, name, cat: str(f.cat) || 'ทั่วไป', unit: str(f.unit) || 'ชิ้น', qty, min, cost, price: cost, loc: str(f.loc) || '-' } });
      // Selling price starts at cost; it is set on the product page before the item is listed (active)
      if (qty) await tx.stockMove.create({ data: { sku, type: 'in', qty, ref: 'ยอดตั้งต้น', by: me.name } });
      await audit(tx, me, 'stock', 'เพิ่มสินค้าใหม่', sku, `${name} · ตั้งต้น ${qty} · จุดสั่งซื้อ ${min}`);
    });
    return 'เพิ่มสินค้าใหม่แล้ว';
  });
}

// ── purchase requests ──

export async function createPR(supplierId: string, noteRaw: string, linesIn: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('purchase');
    const note = str(noteRaw).slice(0, 500);
    const wanted = Object.entries(linesIn ?? {}).map(([sku, q]) => ({ sku, q: int(q) })).filter(x => x.q > 0);
    if (!wanted.length) throw new Fail('ระบุจำนวนสั่งอย่างน้อย 1 รายการ');
    const supplier = str(supplierId) ? await db.supplier.findUnique({ where: { id: str(supplierId) } }) : null;
    if (!supplier || !supplier.active) throw new Fail('กรุณาเลือกผู้ขาย');
    const vendor = supplier.name;   // kept on the PR as written, even if the supplier is renamed later
    const items = await db.inventoryItem.findMany({ where: { sku: { in: wanted.map(w => w.sku) } } });
    const bySku = new Map(items.map(i => [i.sku, i]));
    const lines = wanted.filter(w => bySku.has(w.sku)).map((w, ord) => { const i = bySku.get(w.sku)!; return { ord, sku: i.sku, name: i.name, unit: i.unit, qty: w.q, price: i.cost }; });
    if (!lines.length) throw new Fail('ไม่พบสินค้าที่เลือก');
    const total = lines.reduce((a, l) => a + l.qty * num(l.price), 0);
    const year = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ, year: 'numeric' });
    await db.$transaction(async tx => {
      const id = `PR-${year}-${String(await nextSeq(tx, 'pr')).padStart(4, '0')}`;
      await tx.purchaseRequest.create({ data: { id, requesterId: me.id, vendor, supplierId: supplier.id, note, status: 'pending', lines: { create: lines } } });
      await audit(tx, me, 'purchase', 'สร้างใบขอซื้อ', id, `${vendor} · ${baht(total * (1 + VAT))}`);
    });
    return 'ส่งใบขอซื้อให้ Manager อนุมัติแล้ว';
  });
}

const prTotal = (lines: { qty: number; price: Prisma.Decimal }[]) => lines.reduce((a, l) => a + l.qty * num(l.price), 0);

export async function approvePR(id: string) {
  return act(async () => {
    const me = await requireAction('approvals');
    const p = await db.purchaseRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!p || (p.status !== 'pending' && p.status !== 'pending_exec')) throw new Fail('ใบขอซื้อนี้ไม่อยู่ในสถานะรออนุมัติ');
    const chk = canDecide(p, me);
    if (!chk.ok) throw new Fail(chk.why!);
    const limit = config.approvalLimit(), grand = prTotal(p.lines) * (1 + VAT);
    const toExec = p.status === 'pending' && grand > limit;
    const now = new Date();
    await db.$transaction(async tx => {
      const data: Prisma.PurchaseRequestUncheckedUpdateManyInput = toExec
        ? { status: 'pending_exec' }
        : { status: 'approved', approverId: me.id, decided: now };
      if (p.status === 'pending') Object.assign(data, { approver1Id: me.id, decided1: now });
      // `status: p.status` guards against a concurrent decision on the same PR
      const r = await tx.purchaseRequest.updateMany({ where: { id, status: p.status }, data });
      if (r.count !== 1) throw new Fail('ใบขอซื้อนี้ถูกพิจารณาไปแล้ว');
      await audit(tx, me, 'purchase', toExec ? 'อนุมัติขั้นที่ 1 (ส่งต่อผู้บริหาร)' : 'อนุมัติใบขอซื้อ', id, baht(grand));
    });
    return toExec ? `อนุมัติขั้นที่ 1 แล้ว — ยอดเกิน ${bahtS(limit)} ส่งต่อผู้บริหาร` : `อนุมัติ ${id} แล้ว — ผู้ขอออกใบสั่งซื้อได้ทันที`;
  });
}

export async function rejectPR(id: string, reasonRaw: string) {
  return act(async () => {
    const me = await requireAction('approvals');
    const reason = str(reasonRaw).slice(0, 500);
    const p = await db.purchaseRequest.findUnique({ where: { id } });
    if (!p || (p.status !== 'pending' && p.status !== 'pending_exec')) throw new Fail('ใบขอซื้อนี้ไม่อยู่ในสถานะรออนุมัติ');
    const chk = canDecide(p, me);
    if (!chk.ok) throw new Fail(chk.why!);
    if (!reason) throw new Fail('กรุณาระบุเหตุผล');
    await db.$transaction(async tx => {
      const r = await tx.purchaseRequest.updateMany({ where: { id, status: p.status }, data: { status: 'rejected', approverId: me.id, decided: new Date(), reason } });
      if (r.count !== 1) throw new Fail('ใบขอซื้อนี้ถูกพิจารณาไปแล้ว');
      await audit(tx, me, 'purchase', 'ไม่อนุมัติใบขอซื้อ', id, reason);
    });
    return `ไม่อนุมัติ ${id}`;
  });
}

export async function receivePR(id: string, serialsBySku: Record<string, string[]> = {}) {
  return act(async () => {
    const me = await requireAction('purchase');
    const p = await db.purchaseRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!p || (p.requesterId !== me.id && !PR_SEE_ALL.includes(me.role))) throw new Fail('ไม่พบใบขอซื้อ');
    if (p.status !== 'approved') throw new Fail('รับเข้าคลังได้เฉพาะใบที่อนุมัติแล้ว');
    const tracked = new Set((await db.inventoryItem.findMany({ where: { sku: { in: p.lines.map(l => l.sku) }, serialTracked: true }, select: { sku: true } })).map(i => i.sku));
    const serials = new Map(p.lines.filter(l => tracked.has(l.sku)).map(l => [l.sku, readSerials(serialsBySku?.[l.sku], l.qty, l.name)]));
    const all = [...serials.values()].flat();
    const dup = all.find((x, i) => all.indexOf(x) !== i);
    if (dup) throw new Fail(`Serial ${dup} ซ้ำกันในรายการ`);
    await db.$transaction(async tx => {
      const r = await tx.purchaseRequest.updateMany({ where: { id, status: 'approved' }, data: { status: 'received', received: new Date() } });
      if (r.count !== 1) throw new Fail('ใบขอซื้อนี้รับเข้าคลังไปแล้ว');
      for (const l of p.lines) {
        await tx.inventoryItem.updateMany({ where: { sku: l.sku }, data: { qty: { increment: l.qty } } });
        await tx.stockMove.create({ data: { sku: l.sku, type: 'in', qty: l.qty, ref: id, by: me.name } });
        await addSerials(tx, l.sku, serials.get(l.sku) ?? [], id);
      }
      await audit(tx, me, 'purchase', 'รับสินค้าเข้าคลังตามใบขอซื้อ', id, p.lines.map(l => `${l.name} +${l.qty}`).join(', ') + (all.length ? ` · Serial ${all.length} ชิ้น` : ''));
    });
    return `รับสินค้าตาม ${id} เข้าคลังแล้ว`;
  });
}

// ── suppliers ──

export async function saveSupplier(id: string | null, f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('purchase');
    const data = { name: str(f.name).slice(0, 200), taxId: str(f.taxId).replace(/\D/g, '').slice(0, 13), phone: str(f.phone).slice(0, 30), email: str(f.email).toLowerCase().slice(0, 120) };
    if (!data.name) throw new Fail('กรุณากรอกชื่อผู้ขาย');
    if (data.taxId && data.taxId.length !== 13) throw new Fail('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Fail('อีเมลไม่ถูกต้อง');
    const same = await db.supplier.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, NOT: id ? { id } : undefined } });
    if (same) throw new Fail('มีผู้ขายชื่อนี้แล้ว');
    await db.$transaction(async tx => {
      if (id) {
        const cur = await tx.supplier.findUnique({ where: { id } });
        if (!cur) throw new Fail('ไม่พบผู้ขาย');
        const ch = (['name', 'taxId', 'phone', 'email'] as const).filter(k => cur[k] !== data[k]).map(k => `${k} ${cur[k] || '—'} → ${data[k] || '—'}`);
        await tx.supplier.update({ where: { id }, data });
        await audit(tx, me, 'purchase', 'แก้ไขผู้ขาย', data.name, ch.join(' · ') || 'ไม่มีการเปลี่ยนแปลง');
      } else {
        await tx.supplier.create({ data });
        await audit(tx, me, 'purchase', 'เพิ่มผู้ขาย', data.name, data.taxId);
      }
    });
    return id ? 'บันทึกแล้ว' : `เพิ่มผู้ขาย ${data.name} แล้ว`;
  });
}

/** Suppliers are never deleted (old PRs point at them); a stopped one just leaves the PR form. */
export async function setSupplierActive(id: string, active: boolean) {
  return act(async () => {
    const me = await requireAction('purchase');
    const s = await db.supplier.findUnique({ where: { id } });
    if (!s) throw new Fail('ไม่พบผู้ขาย');
    await db.$transaction(async tx => {
      await tx.supplier.update({ where: { id }, data: { active } });
      await audit(tx, me, 'purchase', active ? 'เปิดใช้ผู้ขาย' : 'หยุดใช้ผู้ขาย', s.name);
    });
    return active ? `เปิดใช้ ${s.name}` : `หยุดใช้ ${s.name} — จะไม่อยู่ในรายการตอนสร้างใบขอซื้อ`;
  });
}

// ── adjustments: damaged / lost / physical count (same permission as receiving stock) ──

export async function adjust(sku: string, kind: string, amount: string, reason: string, serials: string[] = []) {
  return act(async () => {
    const me = await requireAction('purchase');
    return adjustStock(me, sku, kind, amount, reason, serials);
  });
}

export async function serialsOnShelf(sku: string): Promise<string[]> {
  await requireAction('purchase');
  return inStockSerials(str(sku));
}
