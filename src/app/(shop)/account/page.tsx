import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/server/db';
import { getCustomer } from '@/server/customer-session';
import { logoutCustomer } from '@/server/actions/customer-auth';
import { recentOrders } from '@/server/my-orders';
import { fmtD } from '@/lib/domain';
import { OrderList } from './orders/order-list';
import css from '../storefront.module.css';

export const metadata: Metadata = { title: 'บัญชีของฉัน · COREPICK' };

export default async function AccountPage() {
  const c = await getCustomer();
  if (!c) redirect('/account/login?next=/account');
  const [addresses, orders] = await Promise.all([
    db.address.findMany({ where: { customerId: c.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }),
    recentOrders(c.id),
  ]);
  return (
    <div className={`anim-page ${css.account}`}>
      <div className={css.listHead}>
        <h1>บัญชีของฉัน</h1>
        <form action={logoutCustomer} style={{ marginLeft: 'auto' }}><button className="btn btn-secondary">ออกจากระบบ</button></form>
      </div>
      <section aria-labelledby="ord-h">
        <div className={css.secHead} style={{ marginTop: 0 }}><h2 id="ord-h">คำสั่งซื้อล่าสุด</h2>{orders.length > 0 && <Link href="/account/orders">ดูทั้งหมด</Link>}</div>
        {orders.length ? <OrderList orders={orders} /> : <div className="empty">ยังไม่มีคำสั่งซื้อ — <Link href="/shop">เลือกซื้อสินค้า</Link></div>}
      </section>
      <section className="card" aria-labelledby="me-h">
        <h2 id="me-h" className={css.cardH}>ข้อมูลสมาชิก</h2>
        <dl className={css.facts}>
          <dt>ชื่อ</dt><dd>{c.name}</dd>
          <dt>อีเมล</dt><dd>{c.email}</dd>
          <dt>เบอร์โทร</dt><dd>{c.phone || '—'}</dd>
          <dt>สมาชิกตั้งแต่</dt><dd>{fmtD(c.createdAt)}</dd>
        </dl>
      </section>
      <section className="card" aria-labelledby="addr-h">
        <h2 id="addr-h" className={css.cardH}>ที่อยู่จัดส่ง</h2>
        {addresses.length
          ? <ul className={css.addrList}>{addresses.map(a => (
              <li key={a.id}><strong>{a.name}</strong> · {a.phone}{a.isDefault && <span className="tag tag-accent" style={{ marginLeft: 8 }}>ค่าเริ่มต้น</span>}<br />
                {a.line1} ต.{a.subdistrict} อ.{a.district} จ.{a.province} {a.postcode}</li>))}</ul>
          : <p className="muted" style={{ margin: 0 }}>ยังไม่มีที่อยู่ — ระบบจะบันทึกให้ตอนสั่งซื้อครั้งแรก</p>}
      </section>
    </div>
  );
}
