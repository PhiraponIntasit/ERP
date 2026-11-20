import Link from 'next/link';
import { requirePage } from '@/server/auth';
import { claimPage, CLAIM_TABS, isClaimTab } from '@/server/claims';
import { Pager } from '@/components/pager';

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  await requirePage('claims');
  const sp = await searchParams;
  const tab = isClaimTab(sp.tab) ? sp.tab : 'open', q = (sp.q ?? '').slice(0, 100).trim();
  const { rows, page, counts } = await claimPage(tab, q, sp.page);
  const keep: Record<string, string> = { tab };
  if (q) keep.q = q;
  const href = (t: string) => `/claims?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return (
    <div className="anim-page stack-4">
      <p className="lead" style={{ maxWidth: '80ch' }}>ลำดับงาน: ลูกค้าแจ้งเคลมจากหน้าร้าน → ได้รับเครื่องแล้วกด “รับเครื่องแล้ว” → ตรวจอาการ แล้วเปลี่ยนเครื่องใหม่จากสต็อก หรือไม่อนุมัติพร้อมเหตุผล ระบบแจ้งลูกค้าทางอีเมลทุกขั้น</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <nav aria-label="สถานะเคลม" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CLAIM_TABS.map(([t, label]) => (
            <Link key={t} href={href(t)} className={`chip${t === tab ? ' on' : ''}`} style={{ textDecoration: 'none' }} aria-current={t === tab ? 'page' : undefined}>
              {label} <span className="tnum">{counts[t]}</span>
            </Link>
          ))}
        </nav>
        <form style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: '1 1 260px', maxWidth: 360 }}>
          <input type="hidden" name="tab" value={tab} />
          <input className="input" type="search" name="q" defaultValue={q} placeholder="เลขเคลม Serial คำสั่งซื้อ ลูกค้า" aria-label="ค้นหาเคลม" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-secondary">ค้นหา</button>
        </form>
      </div>
      <div className="scroll-x">
        <table className="table" aria-label="เคลมสินค้า">
          <thead><tr><th>เลขที่</th><th>วันที่แจ้ง</th><th>ลูกค้า</th><th>สินค้า / Serial</th><th>อาการ</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} data-claim={c.id}>
                <td className="tnum nw"><Link href={`/claims/${c.id}`}>{c.id}</Link></td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{c.createdText}</td>
                <td style={{ fontSize: 14 }}>{c.customer}</td>
                <td style={{ fontSize: 13, maxWidth: 280 }}>{c.name}<div className="muted tnum">{c.serial}</div></td>
                <td style={{ fontSize: 13, maxWidth: 320 }}>{c.problem.length > 120 ? c.problem.slice(0, 120) + '…' : c.problem}</td>
                <td><span className={`tag ${c.statusTag}`}>{c.statusLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">{q ? 'ไม่พบเคลมที่ค้นหา' : 'ไม่มีเคลมในสถานะนี้'}</div>}
      <Pager p={page} keep={keep} />
    </div>
  );
}
