import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { myBuilds } from '@/server/pc-builder';
import { SLOT_LABEL } from '@/lib/compat';
import { baht, fmtDT } from '@/lib/domain';
import { DeleteBuild } from './delete';
import css from '../../storefront.module.css';

export const metadata: Metadata = { title: 'สเปคที่บันทึกไว้ · COREPICK' };

export default async function MyBuildsPage() {
  const c = await getCustomer();
  if (!c) redirect('/account/login?next=/account/builds');
  const builds = await myBuilds(c.id);
  return (
    <div className={`anim-page ${css.account}`}>
      <nav className={css.crumbs} aria-label="ตำแหน่งหน้า"><Link href="/account">บัญชีของฉัน</Link><span aria-hidden>›</span><span>สเปคที่บันทึกไว้</span></nav>
      <div className={css.listHead}>
        <h1>สเปคที่บันทึกไว้</h1>
        <Link href="/build" className="btn btn-primary" style={{ marginLeft: 'auto' }}>จัดสเปคใหม่</Link>
      </div>
      {builds.length ? (
        <ul className={css.orders} aria-label="สเปคที่บันทึกไว้">
          {builds.map(b => (
            <li key={b.id} className={`card ${css.order}`} data-build={b.name}>
              <div className={css.orderHead}>
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                <span className="muted tnum" style={{ fontSize: 13, marginLeft: 'auto' }}>{fmtDT(b.createdAt)}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {b.parts.map(p => <li key={p.slot}><span className="muted">{SLOT_LABEL[p.slot]}:</span> {p.name}{p.gone && <span className="err"> (เลิกขายแล้ว)</span>}</li>)}
              </ul>
              <div className={css.orderBody}>
                <span className="muted" style={{ fontSize: 13 }}>ราคาวันนี้</span>
                <span className={`${css.orderTotal} tnum`}>{baht(b.total)}</span>
              </div>
              <div className={css.orderActions}>
                <DeleteBuild id={b.id} name={b.name} />
                <Link href={b.href} className="btn btn-primary">เปิดสเปคนี้</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="empty">ยังไม่มีสเปคที่บันทึกไว้ — <Link href="/build">เริ่มจัดสเปคคอม</Link></div>}
    </div>
  );
}
