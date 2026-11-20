import 'server-only';
import type { Prisma } from '@prisma/client';
import { db, num } from './db';
import { expireDue, ORDER_ST } from './orders';
import { pageOf } from '@/lib/paging';
import { baht, fmtDT } from '@/lib/domain';
import { SHOP, vatOf } from '@/lib/shop';

// Back-office order screens: tabs by what needs doing, search, the detail page and the printable receipt.

export const TABS = [
  ['topack', 'รอแพ็ก'], ['packing', 'กำลังแพ็ก'], ['shipped', 'จัดส่งแล้ว'], ['unpaid', 'รอชำระ'],
  ['refund', 'ต้องคืนเงิน'], ['closed', 'ปิดแล้ว'], ['all', 'ทั้งหมด'],
] as const;
export type Tab = (typeof TABS)[number][0];

export const LATE_MONEY: Prisma.OrderWhereInput = { status: { in: ['expired', 'cancelled'] }, payments: { some: { status: 'successful' } } };
const WHERE: Record<Tab, Prisma.OrderWhereInput> = {
  topack: { status: 'paid' }, packing: { status: 'packing' }, shipped: { status: 'shipped' }, unpaid: { status: 'pending_payment' },
  refund: LATE_MONEY, closed: { status: { in: ['completed', 'refunded', 'expired', 'cancelled'] } }, all: {},
};
export const isTab = (t: string | undefined): t is Tab => TABS.some(x => x[0] === t);

const PER_PAGE = 20;

export async function orderPage(tab: Tab, qIn: string, rawPage?: string) {
  await expireDue(); // the back office never shows stock held by orders nobody can pay any more
  const q = qIn.trim().slice(0, 100);
  const search: Prisma.OrderWhereInput = q ? { OR: [
    { id: { contains: q, mode: 'insensitive' } }, { trackingNo: { contains: q, mode: 'insensitive' } }, { shipName: { contains: q, mode: 'insensitive' } },
    { customer: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } },
  ] } : {};
  const where = { AND: [WHERE[tab], search] };
  const [total, counts] = await Promise.all([
    db.order.count({ where }),
    Promise.all(TABS.map(([t]) => db.order.count({ where: WHERE[t] }))).then(ns => Object.fromEntries(TABS.map(([t], i) => [t, ns[i]])) as Record<Tab, number>),
  ]);
  const page = pageOf(rawPage, total, PER_PAGE);
  // Oldest first while there's work to do (first paid, first packed); newest first in the archive tabs
  const oldestFirst = tab === 'topack' || tab === 'packing' || tab === 'refund';
  const rows = await db.order.findMany({
    where, skip: page.skip, take: page.size, orderBy: [{ createdAt: oldestFirst ? 'asc' : 'desc' }, { id: 'asc' }],
    include: { customer: { select: { name: true } }, lines: { select: { name: true, qty: true } }, payments: { select: { status: true } } },
  });
  return {
    page, counts,
    rows: rows.map(o => ({
      id: o.id, createdText: fmtDT(o.createdAt), customer: o.customer.name, items: o.lines.map(l => `${l.name} × ${l.qty}`).join(', '),
      totalText: baht(num(o.total)), status: o.status, statusLabel: ORDER_ST[o.status]?.[0] ?? o.status, statusTag: ORDER_ST[o.status]?.[1] ?? 'tag-neutral',
      lateMoney: ['expired', 'cancelled'].includes(o.status) && o.payments.some(p => p.status === 'successful'),
      tracking: o.trackingNo ? `${o.carrier} ${o.trackingNo}` : '',
    })),
  };
}

export async function orderDetail(id: string) {
  const o = await db.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      lines: { include: { item: { select: { serialTracked: true, loc: true } }, serials: { select: { serial: true } } }, orderBy: { id: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!o) return null;
  const log = await db.auditLog.findMany({ where: { cat: 'order', target: id }, orderBy: [{ t: 'asc' }, { id: 'asc' }] });
  return {
    id: o.id, status: o.status, statusLabel: ORDER_ST[o.status]?.[0] ?? o.status, statusTag: ORDER_ST[o.status]?.[1] ?? 'tag-neutral',
    createdText: fmtDT(o.createdAt), paidText: o.paidAt ? fmtDT(o.paidAt) : '', shippedText: o.shippedAt ? fmtDT(o.shippedAt) : '',
    customer: o.customer, shipName: o.shipName, shipPhone: o.shipPhone, shipAddress: o.shipAddress,
    carrier: o.carrier ?? '', trackingNo: o.trackingNo ?? '',
    refund: o.refundedAt ? { at: fmtDT(o.refundedAt), reason: o.refundReason ?? '', ref: o.refundRef ?? '' } : null,
    lines: o.lines.map(l => ({ id: l.id, sku: l.sku, name: l.name, qty: l.qty, loc: l.item.loc, priceText: baht(num(l.price)), amountText: baht(num(l.price) * l.qty), serialTracked: l.item.serialTracked, serials: l.serials.map(s => s.serial) })),
    subtotalText: baht(num(o.subtotal)), discountText: num(o.discount) ? baht(num(o.discount)) : '', shippingText: num(o.shippingFee) ? baht(num(o.shippingFee)) : 'ฟรี', totalText: baht(num(o.total)),
    payments: o.payments.map(p => ({ id: p.id, status: p.status, amountText: baht(num(p.amount)), ref: p.providerRef ?? '', paidText: p.paidAt ? fmtDT(p.paidAt) : '' })),
    lateMoney: ['expired', 'cancelled'].includes(o.status) && o.payments.some(p => p.status === 'successful'),
    log: log.map(a => ({ id: String(a.id), tText: fmtDT(a.t), by: a.by, action: a.action, detail: a.detail })),
    receipt: receiptOf(o),
  };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof orderDetail>>>;

type ForReceipt = Prisma.OrderGetPayload<{ include: { lines: true; customer: { select: { name: true } } } }>;

/** Receipt / abbreviated tax invoice — only once paid (and not for orders refunded before shipping). */
export function receiptOf(o: ForReceipt) {
  if (!o.paidAt || !['paid', 'packing', 'shipped', 'completed', 'refunded'].includes(o.status)) return null;
  const total = num(o.total), { vat, net } = vatOf(total);
  return {
    no: 'RC' + o.id.slice(3), orderId: o.id, paidText: fmtDT(o.paidAt), customer: o.customer.name, shipName: o.shipName, shipAddress: o.shipAddress,
    lines: o.lines.map((l, k) => ({ no: k + 1, name: l.name, sku: l.sku, qty: l.qty, priceText: baht(num(l.price)), amountText: baht(num(l.price) * l.qty) })),
    subtotalText: baht(num(o.subtotal)), discountText: num(o.discount) ? baht(num(o.discount)) : '', shippingText: num(o.shippingFee) ? baht(num(o.shippingFee)) : 'ฟรี',
    netText: baht(net), vatText: baht(vat), totalText: baht(total), refunded: o.status === 'refunded', shop: SHOP,
  };
}
export type Receipt = NonNullable<ReturnType<typeof receiptOf>>;
