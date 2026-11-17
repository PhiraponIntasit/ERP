import { db } from '@/server/db';
import { getCustomer } from '@/server/customer-session';
import { expireOrder } from '@/server/orders';

// Polled every few seconds by the payment page. Only the order's own customer can read it.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await getCustomer();
  if (!c) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const o = await db.order.findFirst({ where: { id, customerId: c.id }, select: { status: true, expiresAt: true } });
  if (!o) return Response.json({ error: 'not found' }, { status: 404 });
  if (o.status === 'pending_payment' && o.expiresAt < new Date() && (await expireOrder(id, 'expired'))) o.status = 'expired';
  return Response.json({ status: o.status }, { headers: { 'cache-control': 'no-store' } });
}
