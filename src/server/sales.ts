import 'server-only';
import { db, num } from './db';
import { dayKey, zonedTime } from '@/lib/domain';

// Sales report for the back office. Money is VAT-inclusive as charged; gross profit compares sales
// *before VAT* (÷1.07) with purchase cost (which is ex-VAT), so it's the shop's real margin on goods.
// Shipping fees are shown separately and not counted as product profit.

export const PERIODS = [['7d', '7 วัน'], ['30d', '30 วัน'], ['90d', '90 วัน'], ['month', 'เดือนนี้']] as const;
export type Period = (typeof PERIODS)[number][0];
export const isPeriod = (p: string | undefined): p is Period => PERIODS.some(x => x[0] === p);

/** Orders whose money the shop keeps (refunded ones are counted apart). */
export const SOLD = ['paid', 'packing', 'shipped', 'completed'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function rangeOf(p: Period, now = new Date()) {
  const today = dayKey(now);
  const days = p === '7d' ? 7 : p === '30d' ? 30 : p === '90d' ? 90 : Number(today.slice(8, 10));
  const from = zonedTime(dayKey(new Date(now.getTime() - (days - 1) * 864e5)));
  const keys: string[] = [];
  for (let k = 0; k < days; k++) keys.push(dayKey(new Date(from.getTime() + k * 864e5 + 12 * 3600e3)));
  return { from, to: now, keys: [...new Set(keys)] };
}

export async function salesReport(p: Period) {
  const { from, to, keys } = rangeOf(p);
  const [orders, refunds, placed] = await Promise.all([
    db.order.findMany({
      where: { status: { in: SOLD }, paidAt: { gte: from, lte: to } },
      select: { id: true, paidAt: true, subtotal: true, discount: true, shippingFee: true, total: true, couponCode: true,
        lines: { select: { sku: true, name: true, qty: true, price: true, cost: true, item: { select: { cost: true, category: { select: { name: true } } } } } } },
    }),
    db.order.aggregate({ where: { status: 'refunded', refundedAt: { gte: from, lte: to } }, _count: true, _sum: { total: true } }),
    db.order.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
  ]);

  let revenue = 0, goods = 0, discount = 0, shipping = 0, cost = 0, units = 0;
  const daily = new Map(keys.map(k => [k, { revenue: 0, orders: 0 }]));
  const prod = new Map<string, { sku: string; name: string; qty: number; sales: number; profit: number }>();
  const cat = new Map<string, number>();
  const coupons = new Map<string, { orders: number; discount: number }>();
  for (const o of orders) {
    const t = num(o.total), d = num(o.discount);
    revenue += t; discount += d; shipping += num(o.shippingFee); goods += num(o.subtotal) - d;
    const day = daily.get(dayKey(o.paidAt!));
    if (day) { day.revenue += t; day.orders++; }
    if (o.couponCode) { const c = coupons.get(o.couponCode) ?? { orders: 0, discount: 0 }; c.orders++; c.discount += d; coupons.set(o.couponCode, c); }
    for (const l of o.lines) {
      const unitCost = num(l.cost ?? l.item.cost), sales = num(l.price) * l.qty;
      cost += unitCost * l.qty; units += l.qty;
      const x = prod.get(l.sku) ?? { sku: l.sku, name: l.name, qty: 0, sales: 0, profit: 0 };
      x.qty += l.qty; x.sales += sales; x.profit += sales / 1.07 - unitCost * l.qty; prod.set(l.sku, x);
      const cn = l.item.category?.name ?? 'ไม่ระบุหมวด';
      cat.set(cn, (cat.get(cn) ?? 0) + sales);
    }
  }
  const netGoods = goods / 1.07, profit = netGoods - cost;
  const count = (s: string[]) => placed.filter(g => s.includes(g.status)).reduce((a, g) => a + g._count, 0);
  const paidN = count([...SOLD, 'refunded']), lost = count(['expired', 'cancelled']);
  return {
    from, keys,
    kpi: {
      revenue: r2(revenue), orders: orders.length, aov: orders.length ? r2(revenue / orders.length) : 0, units,
      goods: r2(goods), discount: r2(discount), shipping: r2(shipping), cost: r2(cost), profit: r2(profit), margin: netGoods ? profit / netGoods : 0,
      refunds: refunds._count, refundTotal: r2(num(refunds._sum.total ?? 0)),
      conversion: paidN + lost ? paidN / (paidN + lost) : null, unpaidLost: lost,
    },
    daily: keys.map(k => ({ day: k, ...daily.get(k)! })),
    top: [...prod.values()].sort((a, b) => b.sales - a.sales).slice(0, 10).map(x => ({ ...x, sales: r2(x.sales), profit: r2(x.profit) })),
    categories: [...cat.entries()].map(([name, sales]) => ({ name, sales: r2(sales) })).sort((a, b) => b.sales - a.sales),
    coupons: [...coupons.entries()].map(([code, c]) => ({ code, orders: c.orders, discount: r2(c.discount) })).sort((a, b) => b.discount - a.discount),
  };
}
