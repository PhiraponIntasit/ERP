import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db, num } from '@/server/db';
import { getCustomer } from '@/server/customer-session';
import { expireOrder, ORDER_ST } from '@/server/orders';
import { paymentConfig } from '@/server/payments/config';
import { parsePromptPay } from '@/lib/promptpay';
import { baht, fmtDT } from '@/lib/domain';
import { receiptOf } from '@/server/order-views';
import { PayScreen } from './view';

export const metadata: Metadata = { title: 'ชำระเงินด้วย PromptPay · COREPICK' };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCustomer();
  if (!c) return <p className="lead">กรุณาเข้าสู่ระบบลูกค้าเพื่อดูคำสั่งซื้อ</p>;
  const { id } = await params;
  let o = await db.order.findFirst({ where: { id, customerId: c.id }, include: { lines: true, customer: { select: { name: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  if (!o) notFound();
  if (o.status === 'pending_payment' && o.expiresAt < new Date() && (await expireOrder(id, 'expired')))
    o = { ...o, status: 'expired' };
  const p = o.payments[0];
  // Self-check: never show a QR whose amount differs from what the order asks for
  const ok = p?.qrImage && parsePromptPay(p.qrImage)?.amount === num(o.total);
  const svg = o.status === 'pending_payment' && ok ? await QRCode.toString(p.qrImage!, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';
  return (
    <PayScreen id={o.id} status={o.status} statusLabel={ORDER_ST[o.status]?.[0] ?? o.status} svg={svg}
      totalText={baht(num(o.total))} expiresAt={o.expiresAt.toISOString()} paidText={o.paidAt ? fmtDT(o.paidAt) : ''}
      demo={paymentConfig.mode() === 'demo'} canSimulate={paymentConfig.canSimulate()}
      lines={o.lines.map(l => ({ name: l.name, qty: l.qty, amountText: baht(num(l.price) * l.qty) }))}
      receipt={receiptOf(o)} tracking={o.trackingNo ? `${o.carrier} · ${o.trackingNo}` : ''}
      shipText={num(o.shippingFee) ? baht(num(o.shippingFee)) : 'ฟรี'} shipTo={`${o.shipName} · ${o.shipPhone} · ${o.shipAddress}`} />
  );
}
