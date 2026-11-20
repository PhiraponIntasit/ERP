import 'server-only';
import type { Prisma } from '@prisma/client';
import { db, num } from './db';
import { ORDER_ST } from './orders';
import { pageOf } from '@/lib/paging';

// A customer's own orders for "คำสั่งซื้อของฉัน". Always filtered by customerId — one customer can never
// list another's orders. Details, payment and "received" live on B's /pay/[id] page, which checks the same.

export const MY_ORDER_TABS = [
  ['all', 'ทั้งหมด', null],
  ['pay', 'รอชำระเงิน', ['pending_payment']],
  ['active', 'กำลังดำเนินการ', ['paid', 'packing', 'shipped']],
  ['done', 'สำเร็จ', ['completed']],
  ['closed', 'ยกเลิก / คืนเงิน', ['cancelled', 'expired', 'refunded']],
] as const;
export type MyOrderTab = (typeof MY_ORDER_TABS)[number][0];
export const isMyOrderTab = (t: string | undefined): t is MyOrderTab => MY_ORDER_TABS.some(x => x[0] === t);
const MY_ORDERS_PER_PAGE = 10;

const include = { lines: { orderBy: { id: 'asc' } } } satisfies Prisma.OrderInclude;
type Row = Prisma.OrderGetPayload<{ include: typeof include }>;

function view(o: Row, now: number) {
  // an unpaid order past its deadline reads as expired even before the sweep marks it
  const status = o.status === 'pending_payment' && o.expiresAt.getTime() <= now ? 'expired' : o.status;
  const [first, ...rest] = o.lines;
  return {
    id: o.id, status, statusLabel: ORDER_ST[status]?.[0] ?? status, statusTag: ORDER_ST[status]?.[1] ?? 'tag-neutral',
    createdAt: o.createdAt, total: num(o.total), count: o.lines.reduce((a, l) => a + l.qty, 0),
    summary: first ? `${first.name}${first.qty > 1 ? ` × ${first.qty}` : ''}${rest.length ? ` และอีก ${rest.length} รายการ` : ''}` : '',
    payBy: status === 'pending_payment' ? o.expiresAt : null,
    tracking: o.trackingNo ? `${o.carrier ?? ''} ${o.trackingNo}`.trim() : '',
  };
}
export type MyOrder = ReturnType<typeof view>;

export async function myOrders(customerId: string, tab: MyOrderTab, rawPage?: string) {
  const states = MY_ORDER_TABS.find(t => t[0] === tab)?.[2];
  const where: Prisma.OrderWhereInput = { customerId, ...(states ? { status: { in: [...states] } } : {}) };
  const [total, counts] = await Promise.all([
    db.order.count({ where }),
    db.order.groupBy({ by: ['status'], where: { customerId }, _count: true }),
  ]);
  const page = pageOf(rawPage, total, MY_ORDERS_PER_PAGE);
  const rows = await db.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: page.skip, take: page.size });
  const n = (s: readonly string[] | null) => counts.filter(c => !s || s.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const now = Date.now();
  return { rows: rows.map(o => view(o, now)), page, tabs: MY_ORDER_TABS.map(([k, label, s]) => ({ key: k, label, count: n(s) })) };
}

export async function recentOrders(customerId: string, take = 3) {
  const now = Date.now();
  return (await db.order.findMany({ where: { customerId }, include, orderBy: { createdAt: 'desc' }, take })).map(o => view(o, now));
}
