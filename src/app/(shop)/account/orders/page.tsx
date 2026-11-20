import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { isMyOrderTab, myOrders } from '@/server/my-orders';
import { Pager } from '@/components/pager';
import { OrderList } from './order-list';
import css from '../../storefront.module.css';

export const metadata: Metadata = { title: 'คำสั่งซื้อของฉัน · COREPICK' };

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const c = await getCustomer();
  if (!c) redirect('/account/login?next=/account/orders');
  const sp = await searchParams;
  const tab = isMyOrderTab(sp.tab) ? sp.tab : 'all';
  const { rows, page, tabs } = await myOrders(c.id, tab, sp.page);
  return (
    <div className={`anim-page ${css.account}`}>
      <nav className={css.crumbs} aria-label="ตำแหน่งหน้า"><Link href="/account">บัญชีของฉัน</Link><span aria-hidden>›</span><span>คำสั่งซื้อ</span></nav>
      <div className={css.listHead}><h1>คำสั่งซื้อของฉัน</h1></div>
      <div className={`${css.chips} ${css.tabs}`} role="group" aria-label="สถานะคำสั่งซื้อ">
        {tabs.map(t => (
          <Link key={t.key} href={t.key === 'all' ? '/account/orders' : `/account/orders?tab=${t.key}`} className={`chip sm${tab === t.key ? ' on' : ''}`} aria-current={tab === t.key}>
            {t.label} <span className="tnum">({t.count})</span>
          </Link>
        ))}
      </div>
      {rows.length
        ? <OrderList orders={rows} />
        : <div className="empty">{tab === 'all' ? <>ยังไม่มีคำสั่งซื้อ — <Link href="/shop">เลือกซื้อสินค้า</Link></> : 'ไม่มีคำสั่งซื้อในสถานะนี้'}</div>}
      <Pager p={page} keep={tab === 'all' ? {} : { tab }} />
    </div>
  );
}
