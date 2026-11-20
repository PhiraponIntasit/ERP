'use server';
import { db } from '@/server/db';
import { audit, requireAction } from '@/server/auth';
import { act, Fail } from '@/server/act';

/** Suspend or reopen a storefront account. Suspending signs the customer out everywhere (getCustomer also refuses inactive accounts). */
export async function setCustomerActive(customerId: string, active: boolean) {
  return act(async () => {
    const me = await requireAction('customers');
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, email: true, active: true } });
    if (!c) throw new Fail('ไม่พบบัญชีลูกค้า');
    if (c.active === active) return active ? 'บัญชีนี้ใช้งานได้อยู่แล้ว' : 'บัญชีนี้ถูกระงับอยู่แล้ว';
    await db.$transaction(async tx => {
      await tx.customer.update({ where: { id: c.id }, data: { active } });
      if (!active) await tx.customerSession.deleteMany({ where: { customerId: c.id } });
      await audit(tx, me, 'customer', active ? 'เปิดใช้บัญชีลูกค้า' : 'ระงับบัญชีลูกค้า', c.email);
    });
    return active ? `เปิดใช้บัญชี ${c.email} แล้ว` : `ระงับบัญชี ${c.email} แล้ว`;
  });
}
