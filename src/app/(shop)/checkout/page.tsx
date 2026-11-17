import type { Metadata } from 'next';
import { db } from '@/server/db';
import { getCustomer } from '@/server/customer-session';
import { cartLines } from '@/server/orders';
import { paymentConfig } from '@/server/payments/config';
import { CheckoutForm } from './form';

export const metadata: Metadata = { title: 'ชำระเงิน · COREPICK' };

export default async function CheckoutPage() {
  const c = await getCustomer();
  if (!c) return <div className="stack-4"><h1 className="section-h">ชำระเงิน</h1><p className="lead">กรุณาเข้าสู่ระบบลูกค้าก่อนสั่งซื้อ</p></div>;
  const [lines, addr] = await Promise.all([
    cartLines(c.id),
    db.address.findFirst({ where: { customerId: c.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }),
  ]);
  if (!lines.length) return <div className="stack-4"><h1 className="section-h">ชำระเงิน</h1><p className="lead">ตะกร้าว่าง — เลือกสินค้าก่อนสั่งซื้อ</p></div>;
  return <CheckoutForm lines={lines} hasAddress={!!addr} minutes={paymentConfig.payMinutes()}
    init={addr ? { name: addr.name, phone: addr.phone, line1: addr.line1, subdistrict: addr.subdistrict, district: addr.district, province: addr.province, postcode: addr.postcode }
      : { name: c.name, phone: c.phone, line1: '', subdistrict: '', district: '', province: '', postcode: '' }} />;
}
