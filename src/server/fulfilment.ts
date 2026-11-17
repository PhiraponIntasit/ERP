import 'server-only';
import type { User } from '@prisma/client';
import { db, num, type Tx } from './db';
import { Fail, str } from './act';
import { audit } from './auth';
import { baht, REFUND_ROLES } from '@/lib/domain';
import { CARRIERS } from '@/lib/shop';
import { appUrl, sendMail } from './mail';

// After payment (phase 4): paid → packing → shipped (carrier + tracking, serials of serial-tracked units
// recorded against the order line) → completed. Staff may cancel a paid/packing order and refund it, which
// puts the units back in stock. Each step is a conditional update on the old status, as everywhere else.

type Staff = Pick<User, 'id' | 'name' | 'role'>;

async function step(tx: Tx, id: string, from: string | string[], data: Parameters<Tx['order']['updateMany']>[0]['data']) {
  const r = await tx.order.updateMany({ where: { id, status: Array.isArray(from) ? { in: from } : from }, data });
  if (r.count !== 1) throw new Fail('สถานะคำสั่งซื้อเปลี่ยนไปแล้ว — รีเฟรชหน้าแล้วลองใหม่');
}

export async function startPacking(me: Staff, id: string) {
  await db.$transaction(async tx => {
    await step(tx, id, 'paid', { status: 'packing' });
    await audit(tx, me, 'order', 'เริ่มแพ็กสินค้า', id);
  });
}

const SERIAL = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const TRACK = /^[A-Z0-9-]{6,30}$/;

/** Ship a packing order. `serialsByLine` gives the scanned serials for each serial-tracked line. */
export async function shipOrder(me: Staff, id: string, carrierIn: string, trackingIn: string, serialsByLine: Record<string, string[]> = {}) {
  const carrier = str(carrierIn), tracking = str(trackingIn).toUpperCase().replace(/\s+/g, '');
  if (!(CARRIERS as readonly string[]).includes(carrier)) throw new Fail('กรุณาเลือกผู้ให้บริการขนส่ง');
  if (!TRACK.test(tracking)) throw new Fail('เลขพัสดุไม่ถูกต้อง (A–Z, 0–9, - ยาว 6–30 ตัว)');
  const o = await db.order.findUnique({ where: { id }, include: { lines: { include: { item: { select: { serialTracked: true } } } }, customer: true } });
  if (!o) throw new Fail('ไม่พบคำสั่งซื้อ');
  if (o.status !== 'packing') throw new Fail('จัดส่งได้เฉพาะคำสั่งซื้อที่กำลังแพ็ก');

  const plan = o.lines.filter(l => l.item.serialTracked).map(l => {
    const list = (serialsByLine?.[l.id] ?? []).map(x => str(x).toUpperCase()).filter(Boolean);
    if (list.length !== l.qty) throw new Fail(`${l.name}: ต้องสแกน Serial ${l.qty} ชิ้น (ได้ ${list.length})`);
    const bad = list.find(x => !SERIAL.test(x));
    if (bad) throw new Fail(`Serial "${bad}" ไม่ถูกต้อง`);
    return { line: l, serials: list };
  });
  const all = plan.flatMap(p => p.serials);
  const dup = all.find((x, i) => all.indexOf(x) !== i);
  if (dup) throw new Fail(`Serial ${dup} ซ้ำกันในรายการ`);

  await db.$transaction(async tx => {
    for (const { line, serials } of plan) {
      // Only units of this product that are on the shelf; the conditional update also stops two orders taking one unit
      const r = await tx.serialNumber.updateMany({ where: { serial: { in: serials }, sku: line.sku, status: 'in_stock' }, data: { status: 'sold', orderLineId: line.id } });
      if (r.count !== serials.length) {
        const ok = new Set((await tx.serialNumber.findMany({ where: { serial: { in: serials }, sku: line.sku, status: 'in_stock' }, select: { serial: true } })).map(x => x.serial));
        throw new Fail(`${line.name}: Serial ${serials.filter(s => !ok.has(s)).join(', ')} ไม่มีในสต็อกของสินค้านี้`);
      }
    }
    await step(tx, id, 'packing', { status: 'shipped', carrier, trackingNo: tracking, shippedAt: new Date() });
    await audit(tx, me, 'order', 'จัดส่งสินค้า', id, `${carrier} ${tracking}` + (all.length ? ` · Serial ${all.join(', ')}` : ''));
  });

  const base = appUrl();
  await mailSafe(o.customer.email, `จัดส่งคำสั่งซื้อ ${id} แล้ว — ${carrier} ${tracking}`,
    [`เรียนคุณ${o.customer.name}`, '', `ร้านจัดส่งคำสั่งซื้อ ${id} แล้ว`, `ขนส่ง: ${carrier}`, `เลขพัสดุ: ${tracking}`, '', `จัดส่งถึง ${o.shipName} ${o.shipPhone}`, o.shipAddress,
      ...(all.length ? ['', 'Serial สินค้า (ใช้อ้างอิงเมื่อเคลมประกัน):', ...plan.flatMap(p => p.serials.map(s => `- ${p.line.name}: ${s}`))] : []),
      base ? `\nดูคำสั่งซื้อ: ${base}/pay/${id}` : ''].join('\n'));
}

/** Delivered: by staff, or by the customer confirming receipt. */
export async function completeOrder(by: { staff: Staff } | { customer: { id: string; name: string } }, id: string) {
  await db.$transaction(async tx => {
    if ('customer' in by) {
      const r = await tx.order.updateMany({ where: { id, customerId: by.customer.id, status: 'shipped' }, data: { status: 'completed', completedAt: new Date() } });
      if (r.count !== 1) throw new Fail('ยืนยันรับสินค้าได้เฉพาะคำสั่งซื้อที่จัดส่งแล้ว');
      await tx.auditLog.create({ data: { userId: null, by: by.customer.name, role: 'ลูกค้า', cat: 'order', action: 'ลูกค้ายืนยันรับสินค้า', target: id } });
    } else {
      await step(tx, id, 'shipped', { status: 'completed', completedAt: new Date() });
      await audit(tx, by.staff, 'order', 'ปิดคำสั่งซื้อ (ส่งถึงแล้ว)', id);
    }
  });
}

export const canRefund = (me: Pick<User, 'role'>) => REFUND_ROLES.includes(me.role);

function readRefund(reasonIn: string, refIn: string) {
  const reason = str(reasonIn).slice(0, 300), ref = str(refIn).slice(0, 60);
  if (!reason) throw new Fail('กรุณาระบุเหตุผลที่คืนเงิน');
  if (!ref) throw new Fail('กรุณาระบุเลขอ้างอิงการโอนคืน');
  return { reason, ref };
}

/** Cancel a paid order that hasn't shipped, put its units back on the shelf and record the money returned. */
export async function refundOrder(me: Staff, id: string, reasonIn: string, refIn: string) {
  if (!canRefund(me)) throw new Fail('คืนเงินได้เฉพาะ Manager หรือ Admin');
  const { reason, ref } = readRefund(reasonIn, refIn);
  const o = await db.order.findUnique({ where: { id }, include: { lines: true, customer: true } });
  if (!o) throw new Fail('ไม่พบคำสั่งซื้อ');
  if (o.status === 'shipped' || o.status === 'completed') throw new Fail('สินค้าส่งออกไปแล้ว — รับคืนผ่านระบบเคลม/คืนสินค้า');
  await db.$transaction(async tx => {
    await step(tx, id, ['paid', 'packing'], { status: 'refunded', refundedAt: new Date(), refundReason: reason, refundRef: ref });
    for (const l of o.lines) {
      await tx.inventoryItem.update({ where: { sku: l.sku }, data: { qty: { increment: l.qty } } });
      await tx.stockMove.create({ data: { sku: l.sku, type: 'return', qty: l.qty, ref: id, by: me.name } });
    }
    await tx.payment.updateMany({ where: { orderId: id, status: 'successful' }, data: { status: 'refunded' } });
    await audit(tx, me, 'order', 'ยกเลิกและคืนเงิน · คืนสินค้าเข้าสต็อก', id, `${baht(num(o.total))} · อ้างอิง ${ref} · ${reason}`);
  });
  await mailSafe(o.customer.email, `คืนเงินคำสั่งซื้อ ${id} แล้ว`,
    [`เรียนคุณ${o.customer.name}`, '', `ร้านยกเลิกคำสั่งซื้อ ${id} และโอนเงินคืน ${baht(num(o.total))} แล้ว`, `เหตุผล: ${reason}`, `เลขอ้างอิงการโอน: ${ref}`, '', 'ขออภัยในความไม่สะดวก'].join('\n'));
}

/** Money that arrived after the order had expired or been cancelled: record that it was sent back. */
export async function refundLatePayment(me: Staff, id: string, refIn: string) {
  if (!canRefund(me)) throw new Fail('คืนเงินได้เฉพาะ Manager หรือ Admin');
  const { ref } = readRefund('ชำระเงินหลังคำสั่งซื้อหมดเวลา/ยกเลิก', refIn);
  await db.$transaction(async tx => {
    const o = await tx.order.findUnique({ where: { id }, include: { payments: { where: { status: 'successful' } } } });
    if (!o || !['expired', 'cancelled'].includes(o.status) || !o.payments.length) throw new Fail('ไม่มีเงินที่ต้องคืนในคำสั่งซื้อนี้');
    const r = await tx.payment.updateMany({ where: { orderId: id, status: 'successful' }, data: { status: 'refunded' } });
    if (r.count < 1) throw new Fail('คืนเงินไปแล้ว');
    await tx.order.update({ where: { id }, data: { refundedAt: new Date(), refundReason: 'ชำระเงินหลังหมดเวลา/ยกเลิก', refundRef: ref } });
    await audit(tx, me, 'order', 'คืนเงินที่ได้รับหลังหมดเวลา', id, `${o.payments.map(p => baht(num(p.amount))).join(', ')} · อ้างอิง ${ref}`);
  });
}

async function mailSafe(to: string, subject: string, text: string) {
  try {
    const html = `<div style="font-family:sans-serif;white-space:pre-line">${text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</div>`;
    await sendMail(to, subject, text, html);
  } catch (e) { console.error('order mail failed', e); }
}
