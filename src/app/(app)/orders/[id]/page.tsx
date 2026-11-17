import { notFound } from 'next/navigation';
import { requirePage } from '@/server/auth';
import { orderDetail } from '@/server/order-views';
import { canRefund } from '@/server/fulfilment';
import { CARRIERS } from '@/lib/shop';
import { OrderView } from './view';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePage('orders');
  const o = await orderDetail((await params).id);
  if (!o) notFound();
  return <OrderView o={o} canRefund={canRefund(me)} carriers={[...CARRIERS]} />;
}
