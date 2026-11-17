import Link from 'next/link';
import { requirePage } from '@/server/auth';
import { isTab, orderPage, TABS } from '@/server/order-views';
import { Pager } from '@/components/pager';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  await requirePage('orders');
  const sp = await searchParams;
  const tab = isTab(sp.tab) ? sp.tab : 'topack', q = (sp.q ?? '').slice(0, 100);
  const { rows, page, counts } = await orderPage(tab, q, sp.page);
  const keep: Record<string, string> = { tab };
  if (q.trim()) keep.q = q.trim();
  const href = (t: string) => `/orders?tab=${t}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`;
  return (
    <div className="anim-page stack-4">
      <p className="lead" style={{ maxWidth: '80ch' }}>ลำดับงาน: ลูกค้าชำระเงิน → เริ่มแพ็ก หยิบสินค้าตามตำแหน่งที่เก็บ → สแกน Serial (สินค้าที่มีประกันรายชิ้น) ใส่เลขพัสดุแล้วจัดส่ง → ส่งถึงแล้วปิดงาน ระบบแจ้งลูกค้าทางอีเมลทุกขั้น</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <nav aria-label="สถานะคำสั่งซื้อ" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(([t, label]) => (
            <Link key={t} href={href(t)} className={`chip${t === tab ? ' on' : ''}`} style={{ textDecoration: 'none' }} aria-current={t === tab ? 'page' : undefined}>
              {label} <span className="tnum">{counts[t]}</span>
            </Link>
          ))}
        </nav>
        <form style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <input type="hidden" name="tab" value={tab} />
          <input className="input" name="q" defaultValue={q} placeholder="เลขคำสั่งซื้อ ชื่อ อีเมล เลขพัสดุ" aria-label="ค้นหาคำสั่งซื้อ" style={{ width: 260 }} />
          <button className="btn btn-secondary">ค้นหา</button>
        </form>
      </div>
      <div className="scroll-x">
        <table className="table" aria-label="คำสั่งซื้อ">
          <thead><tr><th>เลขที่</th><th>วันที่สั่ง</th><th>ลูกค้า</th><th>รายการ</th><th className="r">ยอดชำระ</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.id}>
                <td className="tnum nw"><Link href={`/orders/${o.id}`}>{o.id}</Link></td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{o.createdText}</td>
                <td style={{ fontSize: 14 }}>{o.customer}</td>
                <td style={{ fontSize: 13, maxWidth: 360 }}>{o.items}{o.tracking && <div className="muted tnum" style={{ fontSize: 12 }}>{o.tracking}</div>}</td>
                <td className="r tnum">{o.totalText}</td>
                <td><span className={`tag ${o.statusTag}`}>{o.statusLabel}</span>{o.lateMoney && <div className="err" style={{ fontSize: 12, marginTop: 4 }}>ได้รับเงินหลังหมดเวลา · ต้องคืนเงิน</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">{q ? 'ไม่พบคำสั่งซื้อที่ค้นหา' : 'ไม่มีคำสั่งซื้อในสถานะนี้'}</div>}
      <Pager p={page} keep={keep} />
    </div>
  );
}
