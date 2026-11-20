import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requirePage } from '@/server/auth';
import { claimDetail } from '@/server/claims';
import { claimStaff, claimTimeline, repairParts } from '@/server/claim-service';
import { ROLE_LABEL } from '@/lib/domain';
import { ClaimActions } from './actions';
import { ServicePanel } from './service';

const dl = { margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 14 } as const;

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePage('claims');
  const c = await claimDetail((await params).id);
  if (!c) notFound();
  const open = c.status === 'submitted' || c.status === 'received';
  const [tl, staff, parts] = await Promise.all([claimTimeline(c.id, false), open ? claimStaff() : [], c.status === 'received' ? repairParts() : []]);
  const u = c.unit;
  return (
    <div className="anim-page stack-4">
      <Link href="/claims" style={{ fontSize: 14 }}>‹ กลับไปรายการเคลม</Link>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 className="section-h tnum" style={{ margin: 0 }}>{c.id}</h2>
        <span className={`tag ${c.statusTag}`} data-testid="claim-status">{c.statusLabel}</span>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <section className="card" aria-labelledby="c-h" style={{ cursor: 'default' }}>
          <h3 id="c-h" className="card-title" style={{ fontSize: 16, margin: 0 }}>เรื่องที่ลูกค้าแจ้ง</h3>
          <dl style={dl}>
            <dt className="muted">แจ้งเมื่อ</dt><dd style={{ margin: 0 }} className="tnum">{c.createdText}</dd>
            {c.receivedText && <><dt className="muted">รับเครื่อง</dt><dd style={{ margin: 0 }} className="tnum">{c.receivedText}</dd></>}
            {c.closedText && <><dt className="muted">ปิดเรื่อง</dt><dd style={{ margin: 0 }} className="tnum">{c.closedText}</dd></>}
            <dt className="muted">ลูกค้า</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {can(me, 'customers') ? <Link href={`/customers/${c.customer.id}`}>{c.customer.name}</Link> : c.customer.name}
              <div className="muted tnum" style={{ fontSize: 13 }}>{c.customer.email} · {c.customer.phone || '—'}</div>
            </dd>
            <dt className="muted">คำสั่งซื้อ</dt><dd style={{ margin: 0 }} className="tnum">{can(me, 'orders') ? <Link href={`/orders/${c.orderId}`}>{c.orderId}</Link> : c.orderId}</dd>
          </dl>
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>อาการเสีย</div>
            <p style={{ margin: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{c.problem}</p>
          </div>
          {c.status === 'replaced' && <p style={{ margin: 0 }}>เปลี่ยนเป็นเครื่องใหม่ Serial <b className="tnum">{c.newSerial}</b>{c.staffNote && ` · ${c.staffNote}`}</p>}
          {c.status === 'rejected' && <p style={{ margin: 0 }}>เหตุผลที่ไม่อนุมัติ: {c.staffNote}</p>}
          {c.status === 'repaired' && <p style={{ margin: 0 }}>ซ่อมคืนเครื่องเดิม: {c.staffNote}{tl!.parts.length > 0 && <><br />อะไหล่: {tl!.parts.map(p => `${p.name} × ${p.qty}`).join(', ')}</>}</p>}
        </section>

        <section className="card" aria-labelledby="u-h" style={{ cursor: 'default' }}>
          <h3 id="u-h" className="card-title" style={{ fontSize: 16, margin: 0 }}>สินค้าและประกัน</h3>
          {u ? (
            <dl style={dl}>
              <dt className="muted">สินค้า</dt><dd style={{ margin: 0 }}>{u.name} <span className="muted tnum">({u.sku})</span></dd>
              <dt className="muted">Serial</dt><dd style={{ margin: 0 }} className="tnum">{can(me, 'warranty') ? <Link href={`/warranty?q=${encodeURIComponent(c.serial)}`}>{c.serial}</Link> : c.serial}</dd>
              <dt className="muted">จัดส่งเมื่อ</dt><dd style={{ margin: 0 }} className="tnum">{u.soldText || '—'}</dd>
              <dt className="muted">ประกันถึง</dt>
              <dd style={{ margin: 0 }} className="tnum" data-testid="warranty-until">
                {u.untilText || '—'} {c.status === 'received' || c.status === 'submitted' ? <span className={`tag ${u.inWarranty ? 'tag-accent' : 'tag-outline'}`}>{u.inWarranty ? 'อยู่ในประกัน' : 'หมดประกัน'}</span> : null}
              </dd>
              <dt className="muted">เครื่องใหม่ในสต็อก</dt><dd style={{ margin: 0 }} className="tnum">{u.status === 'sold' ? `${u.spares.length} เครื่อง` : '—'}</dd>
            </dl>
          ) : <p className="err" style={{ margin: 0 }}>ไม่พบข้อมูล Serial</p>}
        </section>
      </div>

      <ServicePanel id={c.id} open={open} tl={tl!} staff={staff} roleLabel={ROLE_LABEL} />

      {open && <ClaimActions id={c.id} status={c.status} spares={u?.status === 'sold' ? u.spares : []} inWarranty={!!u?.inWarranty} parts={parts} />}

      {u && u.history.length > 0 && (
        <section aria-labelledby="h-h" className="stack-4" style={{ gap: 8 }}>
          <h3 id="h-h" className="section-h" style={{ fontSize: 17 }}>ประวัติของเครื่องนี้</h3>
          <div className="scroll-x">
            <table className="table" aria-label="ประวัติ Serial">
              <thead><tr><th>เวลา</th><th>รายการ</th><th>โดย</th><th>รายละเอียด</th></tr></thead>
              <tbody>{u.history.map(h => <tr key={h.id}><td className="tnum nw" style={{ fontSize: 13 }}>{h.tText}</td><td style={{ fontSize: 14 }}>{h.action}</td><td style={{ fontSize: 13 }}>{h.by}</td><td style={{ fontSize: 13, maxWidth: 420 }}>{h.detail}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
