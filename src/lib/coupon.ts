// Coupon arithmetic, shared by the checkout preview and the server that places the order.

export type CouponRule = { kind: string; value: number; maxDiscount: number | null; minSpend: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Baht off `subtotal` (goods, VAT included). Never more than the goods are worth. */
export function discountFor(c: CouponRule, subtotal: number): number {
  if (subtotal < c.minSpend) return 0;
  let d = c.kind === 'percent' ? round2((subtotal * c.value) / 100) : c.value;
  if (c.kind === 'percent' && c.maxDiscount != null) d = Math.min(d, c.maxDiscount);
  return round2(Math.min(d, subtotal));
}

export const normCode = (raw: string) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const CODE_RE = /^[A-Z0-9_-]{3,20}$/;

const n = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
/** "ลด 10% (สูงสุด ฿500)" / "ลด ฿300" */
export function describe(c: CouponRule): string {
  const off = c.kind === 'percent' ? `ลด ${n(c.value)}%${c.maxDiscount != null ? ` (สูงสุด ฿${n(c.maxDiscount)})` : ''}` : `ลด ฿${n(c.value)}`;
  return c.minSpend > 0 ? `${off} · ซื้อขั้นต่ำ ฿${n(c.minSpend)}` : off;
}
