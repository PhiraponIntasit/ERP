import 'server-only';
import type { Coupon } from '@prisma/client';
import { num, type Tx } from './db';
import { db } from './db';
import { Fail } from './act';
import { CODE_RE, discountFor, normCode, type CouponRule } from '@/lib/coupon';

export const ruleOf = (c: Coupon): CouponRule => ({ kind: c.kind, value: num(c.value), maxDiscount: c.maxDiscount == null ? null : num(c.maxDiscount), minSpend: num(c.minSpend) });

/** Checks a code for this customer and cart; returns the coupon and the baht off, or throws a message for the customer. */
export async function checkCoupon(tx: Tx | typeof db, rawCode: string, customerId: string, subtotal: number, now = new Date()) {
  const code = normCode(rawCode);
  const c = CODE_RE.test(code) ? await tx.coupon.findUnique({ where: { code } }) : null;
  if (!c || !c.active) throw new Fail('ไม่พบคูปองนี้');
  if (now < c.startsAt) throw new Fail('คูปองนี้ยังไม่เริ่มใช้');
  if (now >= c.endsAt) throw new Fail('คูปองนี้หมดอายุแล้ว');
  if (c.usageLimit != null && c.used >= c.usageLimit) throw new Fail('คูปองนี้ถูกใช้ครบจำนวนแล้ว');
  const rule = ruleOf(c);
  if (subtotal < rule.minSpend) throw new Fail(`คูปองนี้ใช้เมื่อซื้อสินค้าครบ ฿${rule.minSpend.toLocaleString('th-TH')}`);
  if (c.oncePerCustomer && await tx.order.count({ where: { customerId, couponCode: code, status: { notIn: ['expired', 'cancelled'] } } }))
    throw new Fail('คุณใช้คูปองนี้ไปแล้ว');
  return { coupon: c, discount: discountFor(rule, subtotal) };
}

/** Take one use; false if another order took the last one first. */
export async function claimCoupon(tx: Tx, code: string): Promise<boolean> {
  return (await tx.$executeRaw`UPDATE "Coupon" SET "used" = "used" + 1 WHERE "code" = ${code} AND "active" AND ("usageLimit" IS NULL OR "used" < "usageLimit")`) === 1;
}

/** An unpaid order ended: its use goes back. */
export async function releaseCoupon(tx: Tx, code: string) {
  await tx.$executeRaw`UPDATE "Coupon" SET "used" = "used" - 1 WHERE "code" = ${code} AND "used" > 0`;
}
