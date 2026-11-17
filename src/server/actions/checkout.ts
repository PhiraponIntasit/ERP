'use server';
import { db } from '../db';
import { act, Fail } from '../act';
import { getCustomer } from '../customer-session';
import { demoEvent, expireOrder, handleWebhook, placeOrder as place, readAddress } from '../orders';
import { paymentConfig } from '../payments/config';
import { sign } from '../payments/signature';
import { num } from '../db';
import { completeOrder } from '../fulfilment';
import type { Result } from '@/lib/result';

async function me() {
  const c = await getCustomer();
  if (!c) throw new Fail('กรุณาเข้าสู่ระบบก่อนสั่งซื้อ');
  return c;
}

/** Checkout: returns the new order id in `msg` so the page can go to its payment screen. */
export async function placeOrder(f: Record<string, string>): Promise<Result> {
  return act(async () => {
    const c = await me();
    return place(c, readAddress(f), f.save === 'true');
  });
}

/** The customer gives up on an unpaid order; its stock is released straight away. */
export async function cancelMyOrder(id: string) {
  return act(async () => {
    const c = await me();
    const o = await db.order.findFirst({ where: { id, customerId: c.id } });
    if (!o) throw new Fail('ไม่พบคำสั่งซื้อ');
    if (!(await expireOrder(id, 'cancelled', [c.name, 'ลูกค้า']))) throw new Fail('คำสั่งซื้อนี้ยกเลิกไม่ได้แล้ว');
    return `ยกเลิก ${id} แล้ว`;
  });
}

/** Demo mode: pretend the customer's bank transfer cleared — sends the same signed webhook a provider would. */
export async function simulatePayment(id: string) {
  return act(async () => {
    if (paymentConfig.mode() !== 'demo' || !paymentConfig.canSimulate()) throw new Fail('ปิดการจำลองการชำระเงินแล้ว');
    const c = await me();
    const o = await db.order.findFirst({ where: { id, customerId: c.id }, include: { payments: { where: { status: 'pending' } } } });
    if (!o) throw new Fail('ไม่พบคำสั่งซื้อ');
    if (o.status !== 'pending_payment') throw new Fail('คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน');
    if (o.expiresAt < new Date()) { await expireOrder(id, 'expired'); throw new Fail('หมดเวลาชำระเงินแล้ว'); }
    const p = o.payments[0];
    if (!p?.providerRef) throw new Fail('ไม่พบรายการชำระเงิน');
    const body = demoEvent(p.providerRef, num(p.amount));
    const r = await handleWebhook(body, sign(body, paymentConfig.webhookSecret()));
    if (r.body.result !== 'paid') throw new Fail('ยืนยันการชำระเงินไม่สำเร็จ');
    return 'ชำระเงินสำเร็จ (จำลอง)';
  });
}

/** The customer has the parcel: closes the order. */
export async function confirmReceived(id: string) {
  return act(async () => {
    const c = await me();
    await completeOrder({ customer: c }, id);
    return 'ขอบคุณที่ยืนยันรับสินค้า';
  });
}
