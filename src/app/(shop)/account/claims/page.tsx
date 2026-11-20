import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { myClaims } from '@/server/claims';
import { claimTimeline } from '@/server/claim-service';
import { SHOP } from '@/lib/shop';
import { CancelClaim } from './cancel';
import css from '../../storefront.module.css';

export const metadata: Metadata = { title: 'เคลมสินค้า · COREPICK' };

export default async function MyClaimsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const c = await getCustomer();
  if (!c) redirect('/account/login?next=/account/claims');
  const [claims, sp] = await Promise.all([myClaims(c.id), searchParams]);
  const logs = new Map(await Promise.all(claims.map(async x => [x.id, (await claimTimeline(x.id, true))!] as const)));
  const fresh = claims.find(x => x.id === sp.new && x.status === 'submitted');
  return (
    <div className={`anim-page ${css.account}`}>
      <nav className={css.crumbs} aria-label="ตำแหน่งหน้า"><Link href="/account">บัญชีของฉัน</Link><span aria-hidden>›</span><span>เคลมสินค้า</span></nav>
      <div className={css.listHead}>
        <h1>เคลมสินค้า</h1>
        <Link href="/account/claims/new" className="btn btn-primary" style={{ marginLeft: 'auto' }}>แจ้งเคลมใหม่</Link>
      </div>

      {fresh && (
        <section className="card" role="status" aria-labelledby="sent-h">
          <h2 id="sent-h" className={css.cardH}>ส่งเรื่องเคลม {fresh.id} แล้ว</h2>
          <p style={{ margin: 0 }}>ขั้นต่อไป: ส่ง {fresh.name} พร้อมอุปกรณ์ที่มากับกล่องมาที่ร้าน และเขียนเลขที่ <strong className="tnum">{fresh.id}</strong> ไว้หน้ากล่อง</p>
          <p className={css.claimNote}>{SHOP.name}{'\n'}{SHOP.addr}{'\n'}โทร {SHOP.phone}</p>
        </section>
      )}

      {claims.length ? (
        <ul className={css.orders} aria-label="รายการเคลม">
          {claims.map(x => (
            <li key={x.id} className={`card ${css.order}`} data-claim={x.id}>
              <div className={css.orderHead}>
                <span className="tnum" style={{ fontWeight: 600 }}>{x.id}</span>
                <span className={`tag ${x.statusTag}`}>{x.statusLabel}</span>
                <span className="muted tnum" style={{ fontSize: 13, marginLeft: 'auto' }}>{x.createdText}</span>
              </div>
              <div className={css.unitText}>
                <strong>{x.name}</strong>
                <span className="muted tnum">Serial {x.serial} · คำสั่งซื้อ <Link href={`/pay/${x.orderId}`}>{x.orderId}</Link></span>
              </div>
              <p className={css.problem}><span className="muted">อาการ: </span>{x.problem}</p>
              {x.status === 'replaced' && <p className={css.claimNote}>เปลี่ยนเป็นเครื่องใหม่ Serial <span className="tnum">{x.newSerial}</span> แล้ว{x.staffNote && `\n${x.staffNote}`}</p>}
              {x.status === 'rejected' && <p className={css.claimNote}>เหตุผลจากร้าน: {x.staffNote}</p>}
              {x.status === 'repaired' && <p className={css.claimNote}>ซ่อมเสร็จ ร้านส่งเครื่องเดิมคืนให้{`\n`}{x.staffNote}{logs.get(x.id)!.parts.length > 0 && `\nอะไหล่ที่เปลี่ยน: ${logs.get(x.id)!.parts.map(p => `${p.name} × ${p.qty}`).join(', ')}`}</p>}
              <details className={css.claimLog}>
                <summary>ความคืบหน้า ({logs.get(x.id)!.lines.length})</summary>
                <ol aria-label={`ความคืบหน้าเคลม ${x.id}`}>
                  {logs.get(x.id)!.lines.map(l => (
                    <li key={l.key}>
                      <span className="muted tnum">{l.tText}</span>
                      <span style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{l.text}</span>
                      {l.photos.length > 0 && <span className={css.claimPhotos}>{l.photos.map(p => <a key={p.id} href={p.src} target="_blank" rel="noreferrer"><img src={p.src} alt={p.name} width={72} height={72} /></a>)}</span>}
                    </li>
                  ))}
                </ol>
              </details>
              {x.status === 'submitted' && <div className={css.orderActions}><CancelClaim id={x.id} /></div>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">ยังไม่มีการแจ้งเคลม — สินค้าที่มี Serial และยังอยู่ในประกันแจ้งเคลมได้ที่ปุ่ม “แจ้งเคลมใหม่”</div>
      )}
    </div>
  );
}
