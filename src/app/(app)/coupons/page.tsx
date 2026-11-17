import { db, num } from '@/server/db';
import { requirePage } from '@/server/auth';
import { ruleOf } from '@/server/coupons';
import { describe } from '@/lib/coupon';
import { baht, dayKey, DISPLAY_TZ } from '@/lib/domain';

const fmtD = (d: Date) => d.toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: '2-digit' });
import { CouponsView, type CouponRow } from './view';

const SOLD = ['paid', 'packing', 'shipped', 'completed'];

export default async function CouponsPage() {
  await requirePage('coupons');
  const now = new Date();
  const [coupons, usage] = await Promise.all([
    db.coupon.findMany({ orderBy: [{ active: 'desc' }, { endsAt: 'desc' }, { code: 'asc' }] }),
    db.order.groupBy({ by: ['couponCode'], where: { couponCode: { not: null }, status: { in: SOLD } }, _count: true, _sum: { discount: true, total: true } }),
  ]);
  const by = new Map(usage.map(u => [u.couponCode, u]));
  const rows: CouponRow[] = coupons.map(c => {
    const st = !c.active ? ['ปิดใช้', 'tag-outline'] : now < c.startsAt ? ['ยังไม่เริ่ม', 'tag-neutral'] : now >= c.endsAt ? ['หมดอายุ', 'tag-neutral']
      : c.usageLimit != null && c.used >= c.usageLimit ? ['ใช้ครบแล้ว', 'tag-neutral'] : ['ใช้งานได้', 'tag-accent'];
    const u = by.get(c.code);
    const lastDay = dayKey(new Date(c.endsAt.getTime() - 1));
    return {
      code: c.code, text: describe(ruleOf(c)), note: c.note, statusLabel: st[0], statusTag: st[1], active: c.active,
      periodText: `${fmtD(c.startsAt)} – ${fmtD(new Date(c.endsAt.getTime() - 1))}`,
      usedText: c.usageLimit != null ? `${c.used} / ${c.usageLimit}` : `${c.used}`, paidOrders: u?._count ?? 0,
      discountText: baht(num(u?._sum.discount ?? 0)), salesText: baht(num(u?._sum.total ?? 0)),
      form: {
        code: c.code, kind: c.kind, value: String(num(c.value)), maxDiscount: c.maxDiscount == null ? '' : String(num(c.maxDiscount)), minSpend: num(c.minSpend) ? String(num(c.minSpend)) : '',
        startsOn: dayKey(c.startsAt), endsOn: lastDay, usageLimit: c.usageLimit == null ? '' : String(c.usageLimit), oncePerCustomer: String(c.oncePerCustomer), note: c.note,
      },
    };
  });
  return <CouponsView rows={rows} today={dayKey(now)} />;
}
