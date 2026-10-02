'use client';
import { useState } from 'react';
import type { PRView } from '@/server/views';
import { approvePR, rejectPR } from '@/server/actions/stock';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { Pager } from '@/components/pager';
import type { Page } from '@/lib/paging';

export function ApprovalsView({ pending, decided, decidedPage, limitText }: { pending: PRView[]; decided: PRView[]; decidedPage: Page; limitText: string }) {
  const [rejectId, setRejectId] = useState<string | null>(null);
  const { run, pending: busy } = useAction({ errorAs: 'toast' });
  return (
    <div className="anim-page stack-4">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', fontSize: 13, borderTop: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)', padding: '10px 0' }}>
        <span>ผู้ขอซื้อไม่สามารถอนุมัติใบของตนเองได้</span><span>ยอดรวม VAT เกิน {limitText} ต้องผ่าน Manager แล้วตามด้วยผู้บริหาร (Executive)</span><span>ผู้อนุมัติ 2 ขั้นต้องเป็นคนละคน</span>
      </div>
      {!pending.length && <div className="empty">ไม่มีใบขอซื้อที่รออนุมัติ</div>}
      {pending.map(p => (
        <div key={p.id} className="card tcard">
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 22 }}>{p.id}</span>
            <span className={`tag ${p.statusTag}`}>{p.statusLabel}</span>
            <span className="card-meta" style={{ marginLeft: 'auto' }}>ขอโดย {p.requesterName} · {p.dateText}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>ผู้ขาย: {p.vendor} · หมายเหตุ: {p.noteText}</div>
          {p.hasL1 && <div style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>อนุมัติขั้นที่ 1 โดย {p.approver1Name} — ยอดเกิน {limitText} รอผู้บริหารอนุมัติขั้นสุดท้าย</div>}
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>สินค้า</th><th className="r">คงเหลือปัจจุบัน</th><th className="r">จำนวน</th><th className="r">ราคา/หน่วย</th><th className="r">รวม</th></tr></thead>
              <tbody>{p.lineRows.map(l => <tr key={l.no}><td>{l.name}</td><td className="r tnum">{l.stockText}</td><td className="r tnum">{l.qty} {l.unit}</td><td className="r tnum">{l.priceText}</td><td className="r tnum">{l.amountText}</td></tr>)}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="num" style={{ flex: 1, fontSize: 22 }}>รวมทั้งสิ้น {p.grandText} <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--color-neutral-700)' }}>(รวม VAT 7%)</span></div>
            {p.canDecide && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setRejectId(p.id)}>ไม่อนุมัติ</button>
                <button className="btn btn-primary" style={{ paddingInline: 26 }} disabled={busy} onClick={() => run(() => approvePR(p.id))}>{p.approveLabel}</button>
              </div>
            )}
            {!p.canDecide && <span style={{ fontSize: 13, color: 'var(--color-neutral-700)', maxWidth: 360, textAlign: 'right' }}>{p.blockText}</span>}
          </div>
        </div>
      ))}
      <h3 className="section-h" style={{ marginTop: 'var(--space-4)' }}>ประวัติการพิจารณา</h3>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>เลขที่</th><th>ผู้ขอ</th><th>รายการ</th><th className="r">มูลค่า</th><th>ผลการพิจารณา</th><th>ผู้พิจารณา</th></tr></thead>
          <tbody>{decided.map(p => <tr key={p.id}><td className="tnum nw">{p.id}</td><td>{p.requesterName}</td><td style={{ fontSize: 13 }}>{p.itemsSummary}</td><td className="r tnum">{p.grandText}</td><td><span className={`tag ${p.statusTag}`}>{p.statusLabel}</span></td><td style={{ fontSize: 13 }}>{p.approverName}</td></tr>)}</tbody>
        </table>
      </div>
      {!decided.length && <div className="empty">ยังไม่มีใบขอซื้อที่พิจารณาแล้ว</div>}
      <Pager p={decidedPage} />
      {rejectId && <RejectDialog id={rejectId} onClose={() => setRejectId(null)} />}
    </div>
  );
}

function RejectDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { run, pending, error } = useAction();
  return (
    <Dialog title={`ไม่อนุมัติ ${id}`} onClose={onClose}>
      <div className="field"><label htmlFor="rj">เหตุผล (แจ้งกลับผู้ขอ)</label><textarea id="rj" className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => rejectPR(id, reason), onClose)}>ยืนยันไม่อนุมัติ</button>
      </div>
    </Dialog>
  );
}
