import 'server-only';
import { Prisma } from '@prisma/client';
import { db, num } from './db';
import { salesReport, SOLD } from './sales';
import { LATE_MONEY } from './order-views';
import { dayKey, VAT, zonedTime } from '@/lib/domain';

/** The store at a glance: today's and this week's sales, the work queues the storefront creates (orders to pack,
 *  money to refund, claims to handle, purchases to approve) and the latest orders. Aggregated in the database. */
export async function storeDashboard() {
  const startOfToday = zonedTime(dayKey(new Date()));
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [week, today, byStatus, lateMoney, claims, prRows, newCustomers, recent] = await Promise.all([
    salesReport('7d'),
    db.order.aggregate({ where: { status: { in: SOLD }, paidAt: { gte: startOfToday } }, _count: true, _sum: { total: true } }),
    db.order.groupBy({ by: ['status'], where: { status: { in: ['pending_payment', 'paid', 'packing', 'shipped'] } }, _count: true }),
    db.order.count({ where: LATE_MONEY }),
    db.claim.groupBy({ by: ['status'], where: { status: { in: ['submitted', 'received'] } }, _count: true }),
    db.$queryRaw<{ status: string; n: bigint; total: Prisma.Decimal | null }[]>`
      SELECT pr.status, count(DISTINCT pr.id) AS n, sum(l.qty * l.price) AS total
      FROM "PurchaseRequest" pr LEFT JOIN "PRLine" l ON l."prId" = pr.id
      WHERE pr.status IN ('pending', 'pending_exec') GROUP BY pr.status`,
    db.customer.count({ where: { createdAt: { gte: weekAgo } } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8,
      select: { id: true, status: true, total: true, createdAt: true, customer: { select: { name: true } }, payments: { select: { status: true } } } }),
  ]);
  const st = (s: string) => byStatus.find(r => r.status === s)?._count ?? 0;
  const cl = (s: string) => claims.find(r => r.status === s)?._count ?? 0;
  return {
    today: { revenue: num(today._sum.total ?? 0), orders: today._count },
    week,
    orders: { toPack: st('paid'), packing: st('packing'), shipped: st('shipped'), unpaid: st('pending_payment'), lateMoney },
    claims: { submitted: cl('submitted'), received: cl('received') },
    pr: { count: prRows.reduce((a, r) => a + Number(r.n), 0), grand: prRows.reduce((a, r) => a + (r.total ? num(r.total) : 0), 0) * (1 + VAT) },
    newCustomers,
    recent: recent.map(o => ({ id: o.id, status: o.status, total: num(o.total), createdAt: o.createdAt, customer: o.customer.name,
      lateMoney: ['expired', 'cancelled'].includes(o.status) && o.payments.some(p => p.status === 'successful') })),
  };
}
