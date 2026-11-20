import Link from 'next/link';
import { requirePage } from '@/server/auth';
import { customerPage, CUSTOMER_TABS, isCustomerTab } from '@/server/customers-admin';
import { Pager } from '@/components/pager';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  await requirePage('customers');
  const sp = await searchParams;
  const tab = isCustomerTab(sp.tab) ? sp.tab : 'all', q = (sp.q ?? '').slice(0, 100).trim();
  const { rows, page, counts } = await customerPage(tab, q, sp.page);
  const keep: Record<string, string> = tab === 'all' ? {} : { tab };
  if (q) keep.q = q;
  const href = (t: string) => {
    const p = new URLSearchParams(t === 'all' ? {} : { tab: t });
    if (q) p.set('q', q);
    return p.size ? `/customers?${p}` : '/customers';
  };
  return (
    <div className="anim-page stack-4">
      <p className="lead" style={{ maxWidth: '80ch' }}>บัญชีที่ลูกค้าสมัครจากหน้าร้าน ระงับบัญชีแล้วลูกค้าจะออกจากระบบทันทีและเข้าสู่ระบบไม่ได้ ประวัติคำสั่งซื้อยังอยู่ครบ เปิดใช้ใหม่ได้ทุกเมื่อ</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <nav aria-label="สถานะบัญชีลูกค้า" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CUSTOMER_TABS.map(([t, label]) => (
            <Link key={t} href={href(t)} className={`chip${t === tab ? ' on' : ''}`} style={{ textDecoration: 'none' }} aria-current={t === tab ? 'page' : undefined}>
              {label} <span className="tnum">{counts[t]}</span>
            </Link>
          ))}
        </nav>
        <form style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: '1 1 260px', maxWidth: 340 }}>
          {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="ชื่อ อีเมล หรือเบอร์โทร" aria-label="ค้นหาลูกค้า" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-secondary">ค้นหา</button>
        </form>
      </div>
      <div className="scroll-x">
        <table className="table" aria-label="ลูกค้า">
          <thead><tr><th>ลูกค้า</th><th>เบอร์โทร</th><th>สมัครเมื่อ</th><th className="r">คำสั่งซื้อ</th><th className="r">ยอดซื้อที่ชำระแล้ว</th><th>สั่งล่าสุด</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} data-customer={c.email} style={{ opacity: c.active ? 1 : 0.6 }}>
                <td><Link href={`/customers/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link><div className="muted" style={{ fontSize: 12 }}>{c.email}</div></td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{c.joinedText}</td>
                <td className="r tnum">{c.orders}</td>
                <td className="r tnum">{c.spentText}</td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{c.lastText}</td>
                <td><span className={`tag ${c.active ? 'tag-accent' : 'tag-neutral'}`}>{c.active ? 'ใช้งาน' : 'ระงับ'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">{q ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้าในสถานะนี้'}</div>}
      <Pager p={page} keep={keep} />
    </div>
  );
}
