'use server';
import { Prisma } from '@prisma/client';
import { db, nextSeq, num } from '../db';
import { audit, requireAction } from '../auth';
import { act, Fail, int, str } from '../act';
import { baht, bahtS, canDecide, config, DISPLAY_TZ, PR_SEE_ALL, VAT } from '@/lib/domain';

// ── inventory (managing stock requires the "purchase" permission, as in the design) ──

export async function receiveStock(sku: string, rawQty: string, rawNote: string) {
  return act(async () => {
    const me = await requireAction('purchase');
    const qty = int(rawQty), note = str(rawNote).slice(0, 200);
    const it = await db.inventoryItem.findUnique({ where: { sku } });
    if (!it) throw new Fail('กรุณาเลือกสินค้า');
    if (!(qty > 0)) throw new Fail('จำนวนต้องมากกว่า 0');
    await db.$transaction(async tx => {
      const cur = await tx.inventoryItem.update({ where: { sku }, data: { qty: { increment: qty } } });
      await tx.stockMove.create({ data: { sku, type: 'in', qty, ref: note || 'รับเข้าด้วยตนเอง', by: me.name } });
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

export async function createPR(vendorRaw: string, noteRaw: string, linesIn: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('purchase');
    const vendor = str(vendorRaw).slice(0, 200), note = str(noteRaw).slice(0, 500);
    const wanted = Object.entries(linesIn ?? {}).map(([sku, q]) => ({ sku, q: int(q) })).filter(x => x.q > 0);
    if (!wanted.length) throw new Fail('ระบุจำนวนสั่งอย่างน้อย 1 รายการ');
    if (!vendor) throw new Fail('กรุณาระบุผู้ขาย');
    const items = await db.inventoryItem.findMany({ where: { sku: { in: wanted.map(w => w.sku) } } });
    const bySku = new Map(items.map(i => [i.sku, i]));
    const lines = wanted.filter(w => bySku.has(w.sku)).map((w, ord) => { const i = bySku.get(w.sku)!; return { ord, sku: i.sku, name: i.name, unit: i.unit, qty: w.q, price: i.cost }; });
    if (!lines.length) throw new Fail('ไม่พบสินค้าที่เลือก');
    const total = lines.reduce((a, l) => a + l.qty * num(l.price), 0);
    const year = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ, year: 'numeric' });
    await db.$transaction(async tx => {
      const id = `PR-${year}-${String(await nextSeq(tx, 'pr')).padStart(4, '0')}`;
      await tx.purchaseRequest.create({ data: { id, requesterId: me.id, vendor, note, status: 'pending', lines: { create: lines } } });
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

export async function receivePR(id: string) {
  return act(async () => {
    const me = await requireAction('purchase');
    const p = await db.purchaseRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!p || (p.requesterId !== me.id && !PR_SEE_ALL.includes(me.role))) throw new Fail('ไม่พบใบขอซื้อ');
    if (p.status !== 'approved') throw new Fail('รับเข้าคลังได้เฉพาะใบที่อนุมัติแล้ว');
    await db.$transaction(async tx => {
      const r = await tx.purchaseRequest.updateMany({ where: { id, status: 'approved' }, data: { status: 'received', received: new Date() } });
      if (r.count !== 1) throw new Fail('ใบขอซื้อนี้รับเข้าคลังไปแล้ว');
      for (const l of p.lines) {
        await tx.inventoryItem.updateMany({ where: { sku: l.sku }, data: { qty: { increment: l.qty } } });
        await tx.stockMove.create({ data: { sku: l.sku, type: 'in', qty: l.qty, ref: id, by: me.name } });
      }
      await audit(tx, me, 'purchase', 'รับสินค้าเข้าคลังตามใบขอซื้อ', id, p.lines.map(l => `${l.name} +${l.qty}`).join(', '));
    });
    return `รับสินค้าตาม ${id} เข้าคลังแล้ว`;
  });
}
