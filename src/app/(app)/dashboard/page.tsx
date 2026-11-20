import Link from 'next/link';
import { db, num } from '@/server/db';
import { can, requirePage } from '@/server/auth';
import { lowStock } from '@/server/queries';
import { storeDashboard } from '@/server/dashboard';
import { ORDER_ST } from '@/server/orders';
import { baht, bahtS, dayKey, DISPLAY_TZ, fmt, fmtDT, MOD_PATH, type Module } from '@/lib/domain';

// The store's back office at a glance. Every number links to the screen where it is handled, so the
// storefront's work (orders, refunds, claims) and the stock behind it are one click away.

type Row = { label: string; valueText: string; w: string; bg: string };
const bars = (rows: [string, number, string?][], fmtv?: (v: number) => string): Row[] => {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([label, v, bg]) => ({ label, valueText: fmtv ? fmtv(v) : String(v), w: (v / mx * 100) + '%', bg: bg || 'var(--color-accent)' }));
};
const shortDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short' });

export default async function DashboardPage() {
  const me = await requirePage('dashboard');
  const since = new Date(Date.now() - 8 * 864e5);
  const [d, { items, open, lowAll, lowNoPR }, listed, moves] = await Promise.all([
    storeDashboard(),
    lowStock(),
    db.inventoryItem.count({ where: { active: true } }),
    db.stockMove.findMany({ where: { t: { gte: since } }, select: { t: true, type: true, qty: true } }),
  ]);
  const w = d.week.kpi;
  const stockVal = items.reduce((a, i) => a + i.qty * num(i.cost), 0);
  const openClaims = d.claims.submitted + d.claims.received;

  const kpis: { label: string; value: string | number; unit: string; sub: string; page: Module; href?: string; alert?: boolean }[] = [
    { label: 'ยอดขายวันนี้', value: bahtS(d.today.revenue), unit: '', sub: `${d.today.orders} ออเดอร์ที่ชำระแล้ว`, page: 'sales', href: '/sales?p=7d' },
    { label: 'ยอดขาย 7 วัน', value: bahtS(w.revenue), unit: '', sub: `กำไรขั้นต้น ${bahtS(w.profit)} · ${(w.margin * 100).toFixed(1)}%`, page: 'sales', href: '/sales?p=7d' },
    { label: 'รอแพ็ก', value: d.orders.toPack, unit: 'ออเดอร์', sub: `กำลังแพ็ก ${d.orders.packing} · รอชำระ ${d.orders.unpaid}`, page: 'orders', href: '/orders?tab=topack', alert: d.orders.toPack > 0 },
    { label: 'ต้องคืนเงิน', value: d.orders.lateMoney, unit: 'ออเดอร์', sub: 'เงินเข้าหลังหมดเวลาชำระ', page: 'orders', href: '/orders?tab=refund', alert: d.orders.lateMoney > 0 },
    { label: 'เคลมรอดำเนินการ', value: openClaims, unit: 'เรื่อง', sub: `รอรับเครื่อง ${d.claims.submitted} · กำลังตรวจสอบ ${d.claims.received}`, page: 'claims', href: '/claims', alert: openClaims > 0 },
    { label: 'รออนุมัติจัดซื้อ', value: d.pr.count, unit: 'ใบ', sub: `มูลค่า ${bahtS(d.pr.grand)}`, page: 'approvals' },
    { label: 'ต่ำกว่าจุดสั่งซื้อ', value: lowAll.length, unit: 'รายการ', sub: `ยังไม่มีใบขอซื้อ ${lowNoPR.length} รายการ`, page: 'inventory', alert: lowNoPR.length > 0 },
    { label: 'มูลค่าสินค้าคงคลัง', value: bahtS(stockVal), unit: '', sub: `${fmt(items.reduce((a, i) => a + i.qty, 0))} หน่วย · ${items.length} SKU`, page: 'inventory' },
    { label: 'สินค้าบนหน้าร้าน', value: listed, unit: 'รายการ', sub: `ซ่อนจากหน้าร้าน ${items.length - listed} รายการ`, page: 'products' },
    { label: 'ลูกค้าใหม่ 7 วัน', value: d.newCustomers, unit: 'คน', sub: 'สมัครสมาชิกหน้าร้าน', page: 'customers' },
  ];
  const daily = d.week.daily;
  const dmx = Math.max(1, ...daily.map(x => x.revenue));
  const groups = [
    { title: 'สินค้าขายดี 7 วัน', sub: 'ยอดขายรวม VAT', rows: bars(d.week.top.slice(0, 6).map(t => [t.name, t.sales]), bahtS), empty: 'ยังไม่มียอดขายใน 7 วันนี้' },
    { title: 'ยอดขายตามหมวด 7 วัน', sub: 'ยอดขายรวม VAT', rows: bars(d.week.categories.slice(0, 6).map(c => [c.name, c.sales]), bahtS), empty: 'ยังไม่มียอดขายใน 7 วันนี้' },
  ];
  const days = [...Array(7)].map((_, k) => new Date(Date.now() - (6 - k) * 864e5));
  const dayData = days.map(x => { const ms = moves.filter(m => dayKey(m.t) === dayKey(x)); return { d: x, inN: ms.filter(m => m.type === 'in').reduce((a, m) => a + m.qty, 0), outN: ms.filter(m => m.type !== 'in').reduce((a, m) => a + m.qty, 0) }; });
  const smx = Math.max(1, ...dayData.map(x => Math.max(x.inN, x.outN)));
  const seeOrders = can(me, 'orders');

  return (
    <div className="anim-page stack-6">
      <div className="kpi-grid" data-testid="dash-kpis">
        {kpis.map(k => {
          const body = (<>
            <div className="card-kicker">{k.label}</div>
            <div className="kpi-value">{k.value}<span className="kpi-unit">{k.unit}</span></div>
            <div className="card-meta">{k.sub}</div>
          </>);
          const style = k.alert ? { borderColor: 'var(--color-accent-700)' } : undefined;
          return can(me, k.page)
            ? <Link key={k.label} href={k.href ?? MOD_PATH[k.page]} className="card kpi" style={style}>{body}</Link>
            : <div key={k.label} className="card kpi" style={{ ...style, cursor: 'default' }}>{body}</div>;
        })}
      </div>
      <div className="dash-grid">
        <div className="card panel">
          <div><div className="card-title">ยอดขายรายวัน 7 วันล่าสุด</div><div className="card-meta">ยอดชำระแล้วรวม VAT · {w.orders} ออเดอร์ · เฉลี่ย {bahtS(w.aov)} ต่อออเดอร์</div></div>
          <div className="days chart" role="img" aria-label={`กราฟยอดขายรายวัน: ${daily.map(x => `${shortDay(x.day)} ${bahtS(x.revenue)}`).join(', ')}`}>
            {daily.map(x => (
              <div key={x.day} className="day-col">
                <div className="vbar in" title={`${shortDay(x.day)} ${baht(x.revenue)} · ${x.orders} ออเดอร์`} style={{ height: (x.revenue / dmx * 100) + '%', width: 22 }} />
              </div>
            ))}
          </div>
          <div className="days tnum" style={{ fontSize: 11, color: 'var(--color-neutral-700)', textAlign: 'center' }}>
            {daily.map(x => <span key={x.day}>{shortDay(x.day)}</span>)}
          </div>
        </div>
        {groups.map(g => (
          <div key={g.title} className="card panel">
            <div><div className="card-title">{g.title}</div><div className="card-meta">{g.sub}</div></div>
            {g.rows.length ? (
              <div className="col" style={{ gap: 10 }}>
                {g.rows.map(r => (
                  <div key={r.label} className="bar-row">
                    <span>{r.label}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: r.w, background: r.bg }} /></div>
                    <span className="r tnum">{r.valueText}</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty">{g.empty}</div>}
          </div>
        ))}
        <div className="card panel">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}><div className="card-title">ความเคลื่อนไหวสต็อก 7 วันล่าสุด</div><div className="card-meta">จำนวนชิ้น รับเข้า / ขายและเบิกออก</div></div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="legend-sw" style={{ background: 'var(--color-accent)' }} />รับเข้า</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="legend-sw" style={{ background: 'var(--color-neutral-700)' }} />ออก</span>
            </div>
          </div>
          <div className="days chart" role="img" aria-label="กราฟรับเข้าและออก 7 วันล่าสุด">
            {dayData.map(x => (
              <div key={x.d.toISOString()} className="day-col">
                <div className="vbar in" title={`รับเข้า ${x.inN}`} style={{ height: (x.inN / smx * 100) + '%' }} />
                <div className="vbar out" title={`ออก ${x.outN}`} style={{ height: (x.outN / smx * 100) + '%' }} />
              </div>
            ))}
          </div>
          <div className="days tnum" style={{ fontSize: 11, color: 'var(--color-neutral-700)', textAlign: 'center' }}>
            {dayData.map(x => <span key={x.d.toISOString()}>{x.d.toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short' })}</span>)}
          </div>
        </div>
        <div className="card panel" style={{ gap: 'var(--space-2)' }}>
          <div className="card-title">สินค้าต่ำกว่าจุดสั่งซื้อ</div>
          {lowAll.length ? (
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>สินค้า</th><th className="r">ขายได้</th><th className="r">จุดสั่งซื้อ</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {lowAll.map(i => (
                    <tr key={i.sku}><td>{i.name}</td><td className="r tnum" style={{ color: 'var(--color-accent-800)' }}>{i.qty - i.reserved}</td><td className="r tnum">{i.min}</td>
                      <td><span className={`tag ${open.has(i.sku) ? 'tag-neutral' : 'tag-outline'}`}>{open.has(i.sku) ? 'มีใบขอซื้อแล้ว' : 'ต้องสั่งเพิ่ม'}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">สต็อกทุกรายการอยู่เหนือจุดสั่งซื้อ</div>}
        </div>
      </div>
      <div className="card panel" style={{ gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="card-title">คำสั่งซื้อล่าสุดจากหน้าร้าน</div>
          {seeOrders && <Link href="/orders?tab=all" className="ml-auto">ดูทั้งหมด</Link>}
        </div>
        <div className="scroll-x">
          <table className="table" aria-label="คำสั่งซื้อล่าสุด">
            <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>เวลาสั่ง</th><th className="r">ยอดรวม</th><th>สถานะ</th></tr></thead>
            <tbody>
              {d.recent.map(o => (
                <tr key={o.id}>
                  <td className="tnum">{seeOrders ? <Link href={`/orders/${o.id}`}>{o.id}</Link> : o.id}</td>
                  <td>{o.customer}</td><td className="tnum">{fmtDT(o.createdAt)}</td><td className="r tnum">{baht(o.total)}</td>
                  <td><span className={`tag ${ORDER_ST[o.status]?.[1] ?? 'tag-neutral'}`}>{ORDER_ST[o.status]?.[0] ?? o.status}</span>
                    {o.lateMoney && <div className="err" style={{ fontSize: 12, marginTop: 4 }}>ต้องคืนเงิน</div>}</td>
                </tr>
              ))}
              {!d.recent.length && <tr><td colSpan={5} className="empty">ยังไม่มีคำสั่งซื้อ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
