import Link from 'next/link';
import { DownloadIcon } from '@/components/icons';
import { requirePage } from '@/server/auth';
import { isPeriod, PERIODS, salesReport } from '@/server/sales';
import { baht, bahtS, DISPLAY_TZ, fmt } from '@/lib/domain';
import css from './sales.module.css';

const pct = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}`);
const dayLabel = (k: string) => new Date(k + 'T12:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requirePage('sales');
  const raw = (await searchParams).p;
  const p = isPeriod(raw) ? raw : '30d';
  const r = await salesReport(p);
  const k = r.kpi;
  const kpis = [
    { label: 'ยอดขาย (รับเงินแล้ว)', value: bahtS(k.revenue), sub: `${fmt(k.orders)} คำสั่งซื้อ · ${fmt(k.units)} ชิ้น` },
    { label: 'กำไรขั้นต้น', value: bahtS(k.profit), sub: `อัตรากำไร ${pct(k.margin)}% ของยอดสินค้าก่อน VAT` },
    { label: 'ยอดต่อคำสั่งซื้อ', value: bahtS(k.aov), sub: 'ยอดขาย ÷ จำนวนคำสั่งซื้อ' },
    { label: 'ส่วนลดคูปอง', value: bahtS(k.discount), sub: `ค่าส่งที่เก็บได้ ${bahtS(k.shipping)}` },
    { label: 'อัตราชำระสำเร็จ', value: pct(k.conversion), unit: '%', sub: `ไม่ชำระ/ยกเลิก ${fmt(k.unpaidLost)} คำสั่งซื้อ` },
    { label: 'คืนเงิน', value: bahtS(k.refundTotal), sub: `${fmt(k.refunds)} คำสั่งซื้อ` },
  ];
  const mx = Math.max(1, ...r.daily.map(d => d.revenue));
  const every = Math.ceil(r.daily.length / 10); // ~10 date labels whatever the period
  const catMx = Math.max(1, ...r.categories.map(c => c.sales));
  return (
    <div className="anim-page stack-6">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <nav className={css.periods} aria-label="ช่วงเวลา">
          {PERIODS.map(([key, label]) => <Link key={key} href={`/sales?p=${key}`} className={`chip${key === p ? ' on' : ''}`} style={{ textDecoration: 'none' }} aria-current={key === p ? 'page' : undefined}>{label}</Link>)}
        </nav>
        <span className="muted" style={{ fontSize: 13 }}>ตั้งแต่ {r.from.toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: '2-digit' })} ถึงวันนี้ · นับตามวันที่ลูกค้าชำระเงิน</span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {/* plain links: the browser downloads the CSV; the route handler audits the export */}
          <a className="btn btn-secondary" href={`/api/sales/export?p=${p}&kind=orders`} download><DownloadIcon /> CSV รายคำสั่งซื้อ</a>
          <a className="btn btn-secondary" href={`/api/sales/export?p=${p}&kind=products`} download><DownloadIcon /> CSV รายสินค้า</a>
        </div>
      </div>

      <div className="kpi-grid" data-testid="sales-kpis">
        {kpis.map(x => (
          <div key={x.label} className="card kpi" style={{ cursor: 'default' }}>
            <div className="card-kicker">{x.label}</div>
            <div className="kpi-value tnum">{x.value}{x.unit && <span className="kpi-unit">{x.unit}</span>}</div>
            <div className="card-meta">{x.sub}</div>
          </div>
        ))}
      </div>

      <section className="card panel" aria-label="ยอดขายรายวัน">
        <div><div className="card-title">ยอดขายรายวัน</div><div className="card-meta">บาท รวม VAT · ชี้ที่แท่งเพื่อดูยอด</div></div>
        <div className={css.chart} role="img" aria-label={`กราฟยอดขายรายวัน ${r.daily.length} วัน สูงสุด ${bahtS(mx)}`}>
          {r.daily.map(d => (
            <div key={d.day} className={css.col} tabIndex={0} aria-label={`${dayLabel(d.day)}: ${baht(d.revenue)} · ${d.orders} คำสั่งซื้อ`}>
              <div className={css.bar} style={{ height: `${(d.revenue / mx) * 100}%` }} />
              <div className={`${css.tip} tnum`}>{dayLabel(d.day)} · {bahtS(d.revenue)} · {d.orders} ออเดอร์</div>
            </div>
          ))}
        </div>
        <div className={`${css.axis} tnum`} aria-hidden>{r.daily.map((d, i) => <span key={d.day}>{i % every === 0 ? dayLabel(d.day) : ''}</span>)}</div>
        <details>
          <summary style={{ fontSize: 13, cursor: 'pointer' }}>ดูเป็นตาราง</summary>
          <div className="scroll-x"><table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>วันที่</th><th className="r">คำสั่งซื้อ</th><th className="r">ยอดขาย</th></tr></thead>
            <tbody>{r.daily.filter(d => d.orders).map(d => <tr key={d.day}><td className="tnum">{dayLabel(d.day)}</td><td className="r tnum">{d.orders}</td><td className="r tnum">{baht(d.revenue)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </section>

      <div className="dash-grid">
        <section className="card panel" aria-label="สินค้าขายดี" style={{ gridColumn: '1 / -1' }}>
          <div><div className="card-title">สินค้าขายดี 10 อันดับ</div><div className="card-meta">เรียงตามยอดขาย (ก่อนหักส่วนลดคูปอง) · กำไร = ยอดก่อน VAT − ต้นทุน</div></div>
          <div className="scroll-x"><table className="table">
            <thead><tr><th>#</th><th>สินค้า</th><th className="r">ขาย (ชิ้น)</th><th className="r">ยอดขาย</th><th className="r">กำไรขั้นต้น</th></tr></thead>
            <tbody>{r.top.map((t, i) => <tr key={t.sku}><td className="tnum">{i + 1}</td><td>{t.name}<div className="muted tnum" style={{ fontSize: 12 }}>{t.sku}</div></td><td className="r tnum">{t.qty}</td><td className="r tnum">{baht(t.sales)}</td><td className="r tnum">{baht(t.profit)}</td></tr>)}</tbody>
          </table></div>
          {!r.top.length && <div className="empty">ยังไม่มียอดขายในช่วงนี้</div>}
        </section>
        <section className="card panel" aria-label="ยอดขายตามหมวด">
          <div><div className="card-title">ยอดขายตามหมวดสินค้า</div><div className="card-meta">บาท รวม VAT ก่อนหักส่วนลด</div></div>
          <div className="col" style={{ gap: 10 }}>
            {r.categories.map(c => (
              <div key={c.name} className="bar-row" title={`${c.name}: ${baht(c.sales)}`}>
                <span>{c.name}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.sales / catMx) * 100}%`, background: 'var(--color-accent)' }} /></div>
                <span className="r tnum">{bahtS(c.sales)}</span>
              </div>
            ))}
            {!r.categories.length && <div className="empty">—</div>}
          </div>
        </section>
        <section className="card panel" aria-label="สรุปเงิน">
          <div><div className="card-title">ที่มาของยอดขาย</div><div className="card-meta">ช่วงที่เลือก</div></div>
          <div className="tnum" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', fontSize: 14 }}>
            <span>ยอดสินค้าหลังหักส่วนลด</span><span>{baht(k.goods)}</span>
            <span>ค่าจัดส่ง</span><span>{baht(k.shipping)}</span>
            <strong>รวมรับเงิน</strong><strong>{baht(k.revenue)}</strong>
            <span className="muted">ยอดสินค้าก่อน VAT</span><span className="muted">{baht(k.goods / 1.07)}</span>
            <span className="muted">ต้นทุนสินค้า</span><span className="muted">−{baht(k.cost)}</span>
            <strong>กำไรขั้นต้น</strong><strong data-testid="gross-profit">{baht(k.profit)}</strong>
          </div>
          {r.coupons.length > 0 && <>
            <div className="card-title" style={{ fontSize: 16, marginTop: 8 }}>คูปองที่ใช้</div>
            {r.coupons.map(c => <div key={c.code} className="tnum" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{c.code} · {c.orders} ออเดอร์</span><span>−{baht(c.discount)}</span></div>)}
          </>}
        </section>
      </div>
    </div>
  );
}
