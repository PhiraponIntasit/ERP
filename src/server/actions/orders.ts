'use server';
import { act } from '../act';
import { requireAction } from '../auth';
import { completeOrder, refundLatePayment, refundOrder, shipOrder, startPacking } from '../fulfilment';

export async function packOrder(id: string) {
  return act(async () => { const me = await requireAction('orders'); await startPacking(me, id); return `เริ่มแพ็ก ${id}`; });
}

export async function shipIt(id: string, carrier: string, tracking: string, serialsByLine: Record<string, string[]>) {
  return act(async () => { const me = await requireAction('orders'); await shipOrder(me, id, carrier, tracking, serialsByLine); return `จัดส่ง ${id} แล้ว — แจ้งเลขพัสดุลูกค้าทางอีเมลแล้ว`; });
}

export async function markDelivered(id: string) {
  return act(async () => { const me = await requireAction('orders'); await completeOrder({ staff: me }, id); return `ปิดคำสั่งซื้อ ${id} แล้ว`; });
}

export async function refund(id: string, reason: string, ref: string) {
  return act(async () => { const me = await requireAction('orders'); await refundOrder(me, id, reason, ref); return `คืนเงิน ${id} แล้ว — สินค้ากลับเข้าสต็อก`; });
}

export async function refundLate(id: string, ref: string) {
  return act(async () => { const me = await requireAction('orders'); await refundLatePayment(me, id, ref); return `บันทึกการคืนเงิน ${id} แล้ว`; });
}
