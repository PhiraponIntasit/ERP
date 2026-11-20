import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { claimableUnits } from '@/server/claims';
import { ClaimForm } from './form';
import css from '../../../storefront.module.css';

export const metadata: Metadata = { title: 'แจ้งเคลมสินค้า · COREPICK' };

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<{ serial?: string }> }) {
  const c = await getCustomer();
  if (!c) redirect('/account/login?next=/account/claims/new');
  const [units, sp] = await Promise.all([claimableUnits(c.id), searchParams]);
  return (
    <div className={`anim-page ${css.account}`}>
      <nav className={css.crumbs} aria-label="ตำแหน่งหน้า">
        <Link href="/account">บัญชีของฉัน</Link><span aria-hidden>›</span><Link href="/account/claims">เคลมสินค้า</Link><span aria-hidden>›</span><span>แจ้งเคลม</span>
      </nav>
      <div className={css.listHead}><h1>แจ้งเคลมสินค้า</h1></div>
      {units.length
        ? <ClaimForm units={units} initial={(sp.serial ?? '').toUpperCase()} />
        : <div className="empty">ยังไม่มีสินค้าที่มี Serial ในคำสั่งซื้อของคุณ — เคลมได้เฉพาะสินค้าที่ร้านบันทึก Serial ไว้ตอนจัดส่ง เช่น CPU การ์ดจอ เมนบอร์ด</div>}
    </div>
  );
}
