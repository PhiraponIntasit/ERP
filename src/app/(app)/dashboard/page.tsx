import Link from 'next/link';
import { db, num } from '@/server/db';
import { can, requirePage } from '@/server/auth';
import { lowStock } from '@/server/queries';
import { dashboardStats } from '@/server/dashboard';
import { ticketInclude, ticketView } from '@/server/views';
import { bahtS, CATS, dayKey, DISPLAY_TZ, fmt, MOD_PATH, OPEN, PRST, ST, type Module } from '@/lib/domain';

type Row = { label: string; valueText: string; w: string; bg: string };
const bars = (rows: [string, number, string?][], fmtv?: (v: number) => string, fixMx?: number): Row[] => {
  const mx = fixMx || Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([label, v, bg]) => ({ label, valueText: fmtv ? fmtv(v) : String(v), w: (v / mx * 100) + '%', bg: bg || 'var(--color-accent)' }));
};

export default async function DashboardPage() {
  const me = await requirePage('dashboard');
  const since = new Date(Date.now() - 8 * 864e5);
  const techs = await db.user.findMany({ where: { role: 'itsupport', active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } });
  const [stats, { items, open, lowAll, lowNoPR }, assetsTotal, assetsHeld, moves, recent] = await Promise.all([
    dashboardStats(techs.map(t => t.id)),
    lowStock(),
    db.asset.count(), db.asset.count({ where: { holderId: { not: null } } }),
    db.stockMove.findMany({ where: { t: { gte: since } }, select: { t: true, type: true, qty: true } }),
    db.ticket.findMany({ orderBy: { created: 'desc' }, take: 6, include: ticketInclude }),
  ]);

  const byStatus = stats.ticketsByStatus;
  const total = stats.ticketsTotal, done = byStatus('resolved') + byStatus('closed');
  const newCount = byStatus('new'), openCount = OPEN.reduce((a, s) => a + byStatus(s), 0);
  const prSum = (statuses: string[]) => statuses.reduce((a, s) => a + stats.prGrand(s), 0);
  const PENDING = ['pending', 'pending_exec'];
  const pendingAll = PENDING.reduce((a, s) => a + stats.prCount(s), 0);
  const stockVal = items.reduce((a, i) => a + i.qty * num(i.cost), 0);

  const kpis: { label: string; value: string | number; unit: string; sub: string; page: Module }[] = [
    { label: 'คำร้องที่เปิดอยู่', value: openCount, unit: 'งาน', sub: `รอมอบหมาย ${newCount} · วิกฤต ${stats.criticalOpen}`, page: 'dispatch' },
    { label: 'อัตราแก้ไขเสร็จ', value: total ? Math.round(done / total * 100) : 0, unit: '%', sub: `เสร็จ ${done} จาก ${total} งาน`, page: 'dispatch' },
    { label: 'งานซ่อมทัน SLA', value: done ? Math.round(stats.slaMet / done * 100) : 100, unit: '%', sub: `งานเปิดที่เกินกำหนด ${stats.overdue} งาน`, page: 'dispatch' },
    { label: 'รออนุมัติจัดซื้อ', value: pendingAll, unit: 'ใบ', sub: `มูลค่า ${bahtS(prSum(PENDING))}`, page: 'approvals' },
    { label: 'ต่ำกว่าจุดสั่งซื้อ', value: lowAll.length, unit: 'รายการ', sub: `ยังไม่มีใบขอซื้อ ${lowNoPR.length} รายการ`, page: 'inventory' },
    { label: 'มูลค่าสินค้าคงคลัง', value: bahtS(stockVal), unit: '', sub: `${fmt(items.reduce((a, i) => a + i.qty, 0))} หน่วย · ${items.length} SKU`, page: 'inventory' },
    { label: 'อุปกรณ์ที่ส่งมอบ', value: assetsHeld, unit: 'เครื่อง', sub: `ว่างในคลัง IT ${assetsTotal - assetsHeld} เครื่อง`, page: 'assets' },
  ];
  const groups = [
    { title: 'สถานะงานซ่อม', sub: `ทั้งหมด ${total} งาน`, rows: bars(Object.keys(ST).map(k => [ST[k][0], byStatus(k), k === 'new' ? 'var(--color-accent-700)' : undefined])) },
    { title: 'ประเภทปัญหาที่พบ', sub: 'จำนวนคำร้องตามหมวด', rows: bars(CATS.map(([k, l]) => [l, stats.ticketsByCat.get(k) ?? 0])) },
    { title: 'ภาระงาน IT Support', sub: 'งานที่กำลังถือ (ยังไม่เสร็จ)', rows: bars(techs.map(u => [u.name, stats.techLoad.get(u.id) ?? 0])) },
    { title: 'ความพึงพอใจต่อช่าง', sub: 'คะแนนเฉลี่ยจากผู้แจ้งเมื่อปิดงาน (เต็ม 5)', rows: bars(techs.map(u => [u.name, stats.techRating.get(u.id) ?? 0]), v => (v ? v.toFixed(1) + ' / 5' : 'ยังไม่มี'), 5) },
    { title: 'มูลค่าการจัดซื้อตามสถานะ', sub: 'รวม VAT', rows: bars(Object.keys(PRST).map(k => [PRST[k][0], stats.prGrand(k)]), bahtS) },
  ];
  const days = [...Array(7)].map((_, k) => new Date(Date.now() - (6 - k) * 864e5));
  const dayData = days.map(d => { const ms = moves.filter(m => dayKey(m.t) === dayKey(d)); return { d, inN: ms.filter(m => m.type === 'in').reduce((a, m) => a + m.qty, 0), outN: ms.filter(m => m.type === 'out').reduce((a, m) => a + m.qty, 0) }; });
  const dmx = Math.max(1, ...dayData.map(x => Math.max(x.inN, x.outN)));

  return (
    <div className="anim-page stack-6">
      <div className="kpi-grid">
        {kpis.map(k => {
          const body = (<>
            <div className="card-kicker">{k.label}</div>
            <div className="kpi-value">{k.value}<span className="kpi-unit">{k.unit}</span></div>
            <div className="card-meta">{k.sub}</div>
          </>);
          return can(me, k.page)
            ? <Link key={k.label} href={MOD_PATH[k.page]} className="card kpi">{body}</Link>
            : <div key={k.label} className="card kpi" style={{ cursor: 'default' }}>{body}</div>;
        })}
      </div>
      <div className="dash-grid">
        {groups.map(g => (
          <div key={g.title} className="card panel">
            <div><div className="card-title">{g.title}</div><div className="card-meta">{g.sub}</div></div>
            <div className="col" style={{ gap: 10 }}>
              {g.rows.map(r => (
                <div key={r.label} className="bar-row">
                  <span>{r.label}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: r.w, background: r.bg }} /></div>
                  <span className="r tnum">{r.valueText}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="card panel">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}><div className="card-title">ความเคลื่อนไหวสต็อก 7 วันล่าสุด</div><div className="card-meta">จำนวนชิ้น รับเข้า / เบิกออก</div></div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="legend-sw" style={{ background: 'var(--color-accent)' }} />รับเข้า</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="legend-sw" style={{ background: 'var(--color-neutral-700)' }} />เบิกออก</span>
            </div>
          </div>
          <div className="days chart" role="img" aria-label="กราฟรับเข้าและเบิกออก 7 วันล่าสุด">
            {dayData.map(x => (
              <div key={x.d.toISOString()} className="day-col">
                <div className="vbar in" title={`รับเข้า ${x.inN}`} style={{ height: (x.inN / dmx * 100) + '%' }} />
                <div className="vbar out" title={`เบิกออก ${x.outN}`} style={{ height: (x.outN / dmx * 100) + '%' }} />
              </div>
            ))}
          </div>
          <div className="days tnum" style={{ fontSize: 11, color: 'var(--color-neutral-700)', textAlign: 'center' }}>
            {dayData.map(x => <span key={x.d.toISOString()}>{x.d.toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short' })}</span>)}
          </div>
        </div>
        <div className="card panel" style={{ gap: 'var(--space-2)' }}>
          <div className="card-title">สินค้าต่ำกว่าจุดสั่งซื้อ</div>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>สินค้า</th><th className="r">คงเหลือ</th><th className="r">จุดสั่งซื้อ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {lowAll.map(i => (
                  <tr key={i.sku}><td>{i.name}</td><td className="r tnum" style={{ color: 'var(--color-accent-800)' }}>{i.qty}</td><td className="r tnum">{i.min}</td>
                    <td><span className={`tag ${open.has(i.sku) ? 'tag-neutral' : 'tag-outline'}`}>{open.has(i.sku) ? 'มีใบขอซื้อแล้ว' : 'ต้องสั่งเพิ่ม'}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="card panel" style={{ gap: 'var(--space-2)' }}>
        <div className="card-title">คำร้องล่าสุด</div>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>ผู้แจ้ง</th><th>ผู้รับผิดชอบ</th><th>ความเร่งด่วน</th><th>สถานะ</th></tr></thead>
            <tbody>
              {recent.map(ticketView).map(t => (
                <tr key={t.id}><td className="tnum">{t.id}</td><td>{t.title}</td><td>{t.requester}</td><td>{t.assigneeName}</td>
                  <td><span className={`tag ${t.urgTag}`}>{t.urgLabel}</span></td><td><span className={`tag ${t.statusTag}`}>{t.statusLabel}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
