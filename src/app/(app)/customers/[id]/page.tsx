import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requirePage } from '@/server/auth';
import { customerDetail } from '@/server/customers-admin';
import { ActiveToggle } from './toggle';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePage('customers');
  const c = await customerDetail((await params).id);
  if (!c) notFound();
  const seeOrders = can(me, 'orders');
  return (
    <div className="anim-page stack-4">
      <Link href="/customers" style={{ fontSize: 14 }}>‹ กลับไปรายชื่อลูกค้า</Link>
      <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'row', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start', cursor: 'default' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {c.name}<span className={`tag ${c.active ? 'tag-accent' : 'tag-neutral'}`}>{c.active ? 'ใช้งาน' : 'ระงับ'}</span>
          </h2>
          <dl style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 14 }}>
            <dt className="muted">อีเมล</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{c.email}</dd>
            <dt className="muted">เบอร์โทร</dt><dd style={{ margin: 0 }} className="tnum">{c.phone || '—'}</dd>
            <dt className="muted">สมัครเมื่อ</dt><dd style={{ margin: 0 }} className="tnum">{c.joinedText}</dd>
            <dt className="muted">คำสั่งซื้อ</dt><dd style={{ margin: 0 }} className="tnum">{c.ordersTotal} รายการ · ชำระแล้ว {c.paidOrders} รายการ</dd>
            <dt className="muted">ยอดซื้อ</dt><dd style={{ margin: 0 }} className="tnum">{c.spentText}</dd>
            <dt className="muted">ใช้งานอยู่</dt><dd style={{ margin: 0 }}>{c.signedIn ? `เข้าสู่ระบบอยู่ ${c.signedIn} อุปกรณ์` : 'ไม่ได้เข้าสู่ระบบ'}</dd>
          </dl>
        </div>
        <ActiveToggle id={c.id} active={c.active} name={c.name} />
      </div>

      <section aria-labelledby="addr-h" className="stack-4" style={{ gap: 8 }}>
        <h3 id="addr-h" className="section-h">ที่อยู่จัดส่ง</h3>
        {c.addresses.length ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {c.addresses.map(a => (
              <li key={a.id} className="card" style={{ padding: 'var(--space-3)', fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>{a.name} <span className="tnum muted" style={{ fontWeight: 400 }}>{a.phone}</span>{a.isDefault && <span className="tag tag-outline" style={{ marginLeft: 6 }}>ค่าเริ่มต้น</span>}</div>
                <div>{a.text}</div>
              </li>
            ))}
          </ul>
        ) : <div className="empty">ยังไม่มีที่อยู่ที่บันทึกไว้</div>}
      </section>

      <section aria-labelledby="ord-h" className="stack-4" style={{ gap: 8 }}>
        <h3 id="ord-h" className="section-h">คำสั่งซื้อล่าสุด{c.ordersTotal > c.orders.length && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · แสดง {c.orders.length} จาก {c.ordersTotal}</span>}</h3>
        {c.orders.length ? (
          <div className="scroll-x">
            <table className="table" aria-label="คำสั่งซื้อของลูกค้า">
              <thead><tr><th>เลขที่</th><th>วันที่สั่ง</th><th>รายการ</th><th className="r">ยอดชำระ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {c.orders.map(o => (
                  <tr key={o.id}>
                    <td className="tnum nw">{seeOrders ? <Link href={`/orders/${o.id}`}>{o.id}</Link> : o.id}</td>
                    <td className="tnum nw" style={{ fontSize: 13 }}>{o.createdText}</td>
                    <td style={{ fontSize: 13, maxWidth: 380 }}>{o.items}</td>
                    <td className="r tnum">{o.totalText}</td>
                    <td><span className={`tag ${o.statusTag}`}>{o.statusLabel}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">ยังไม่มีคำสั่งซื้อ</div>}
      </section>
    </div>
  );
}
