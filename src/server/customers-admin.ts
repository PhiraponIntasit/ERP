import 'server-only';
import type { Prisma } from '@prisma/client';
import { db, num } from './db';
import { ORDER_ST } from './orders';
import { SOLD } from './sales';
import { pageOf } from '@/lib/paging';
import { baht, DISPLAY_TZ } from '@/lib/domain';

// Back-office view of storefront customers: who they are, what they bought, and whether they may sign in.

export const CUSTOMER_TABS = [['all', 'ทั้งหมด'], ['active', 'ใช้งาน'], ['suspended', 'ระงับ']] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number][0];
export const isCustomerTab = (t: string | undefined): t is CustomerTab => CUSTOMER_TABS.some(x => x[0] === t);
export const CUSTOMERS_PAGE_SIZE = 20;

const fmtDate = (d: Date) => d.toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: '2-digit' });
const fmtTime = (d: Date) => d.toLocaleString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Every word must match name, email or phone. */
function searchWhere(q: string): Prisma.CustomerWhereInput {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return { AND: words.map(w => ({ OR: [{ name: { contains: w, mode: 'insensitive' } }, { email: { contains: w, mode: 'insensitive' } }, { phone: { contains: w } }] })) };
}

/** Paid money per customer (orders that are paid, packing, shipped or completed). */
async function spendOf(ids: string[]) {
  if (!ids.length) return new Map<string, { orders: number; paid: number; spent: number; last: Date | null }>();
  const [sold, all] = await Promise.all([
    db.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { in: SOLD } }, _sum: { total: true }, _count: true }),
    db.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: true, _max: { createdAt: true } }),
  ]);
  const s = new Map(sold.map(r => [r.customerId, r]));
  return new Map(all.map(r => [r.customerId, { orders: r._count, paid: s.get(r.customerId)?._count ?? 0, spent: num(s.get(r.customerId)?._sum.total ?? 0), last: r._max.createdAt }]));
}

export async function customerPage(tab: CustomerTab, q: string, rawPage?: string) {
  const base = q.trim() ? searchWhere(q) : {};
  const where: Prisma.CustomerWhereInput = tab === 'all' ? base : { ...base, active: tab === 'active' };
  const [total, grouped] = await Promise.all([
    db.customer.count({ where }),
    db.customer.groupBy({ by: ['active'], where: base, _count: true }),
  ]);
  const page = pageOf(rawPage, total, CUSTOMERS_PAGE_SIZE);
  const list = await db.customer.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: page.skip, take: page.size });
  const stats = await spendOf(list.map(c => c.id));
  const n = (a: boolean) => grouped.find(g => g.active === a)?._count ?? 0;
  return {
    page,
    counts: { all: n(true) + n(false), active: n(true), suspended: n(false) } as Record<CustomerTab, number>,
    rows: list.map(c => {
      const st = stats.get(c.id);
      return {
        id: c.id, name: c.name, email: c.email, phone: c.phone, active: c.active, joinedText: fmtDate(c.createdAt),
        orders: st?.orders ?? 0, spentText: baht(st?.spent ?? 0), lastText: st?.last ? fmtDate(st.last) : '—',
      };
    }),
  };
}

export async function customerDetail(id: string) {
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] },
      orders: { orderBy: { createdAt: 'desc' }, take: 20, include: { lines: { select: { name: true, qty: true } } } },
      _count: { select: { orders: true, sessions: { where: { expiresAt: { gt: new Date() } } } } },
    },
  });
  if (!c) return null;
  const st = (await spendOf([c.id])).get(c.id);
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone, active: c.active, joinedText: fmtDate(c.createdAt),
    ordersTotal: c._count.orders, paidOrders: st?.paid ?? 0, spentText: baht(st?.spent ?? 0), signedIn: c._count.sessions,
    addresses: c.addresses.map(a => ({ id: a.id, isDefault: a.isDefault, name: a.name, phone: a.phone, text: [a.line1, a.subdistrict, a.district, a.province, a.postcode].filter(Boolean).join(' ') })),
    orders: c.orders.map(o => ({
      id: o.id, createdText: fmtTime(o.createdAt), totalText: baht(num(o.total)),
      statusLabel: ORDER_ST[o.status]?.[0] ?? o.status, statusTag: ORDER_ST[o.status]?.[1] ?? 'tag-neutral',
      items: o.lines.map(l => `${l.name} × ${l.qty}`).join(', '),
    })),
  };
}
export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof customerDetail>>>;
