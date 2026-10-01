'use client';
import { useState } from 'react';
import type { TicketView } from '@/server/views';
import { updateTicketStatus, withdrawPart } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { Thumbs, TicketBody, TicketHead } from '@/components/ticket-bits';
import { ST, WORK_STATUSES } from '@/lib/domain';

type Inv = { sku: string; name: string; qty: number; unit: string };

export function WorkList({ tickets, inv, showAssignee }: { tickets: TicketView[]; inv: Inv[]; showAssignee: boolean }) {
  const [withdrawFor, setWithdrawFor] = useState<string | null>(null);
  return (
    <div className="anim-page stack-4">
      {!tickets.length && <div className="empty">ยังไม่มีงานที่ได้รับมอบหมาย</div>}
      {tickets.map(t => <WorkCard key={t.id} t={t} showAssignee={showAssignee} onWithdraw={() => setWithdrawFor(t.id)} />)}
      {withdrawFor && <WithdrawDialog tid={withdrawFor} inv={inv} onClose={() => setWithdrawFor(null)} />}
    </div>
  );
}

function WorkCard({ t, showAssignee, onWithdraw }: { t: TicketView; showAssignee: boolean; onWithdraw: () => void }) {
  const [status, setStatus] = useState(t.status);
  const [note, setNote] = useState('');
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <div className="card tcard">
      <TicketHead t={t} order="urg-first" />
      <TicketBody t={t} />
      <div className="meta-line">
        <span>ผู้แจ้ง: {t.requester} ({t.dept})</span><span>ประเภท: {t.catLabel}</span><span>Asset: {t.assetText}</span>
        {showAssignee && <span>ช่าง: {t.assigneeName}</span>}
      </div>
      <Thumbs t={t} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className="muted">อะไหล่ที่เบิกแล้ว:</span>
        {t.parts.map(p => <span key={p} className="tag tag-neutral">{p}</span>)}
        {!t.parts.length && <span>—</span>}
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={onWithdraw}>+ เบิกอะไหล่ / อุปกรณ์จากคลัง</button>
      </div>
      <div className="work-row divider-top">
        <select className="input" value={status} aria-label="สถานะ" onChange={e => setStatus(e.target.value)}>
          {WORK_STATUSES.map(k => <option key={k} value={k}>{ST[k][0]}</option>)}
        </select>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="บันทึกการทำงาน (ถ้ามี)" aria-label="บันทึกการทำงาน" />
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => updateTicketStatus(t.id, status, note), () => setNote(''))}>อัปเดตสถานะ</button>
      </div>
    </div>
  );
}

function WithdrawDialog({ tid, inv, onClose }: { tid: string; inv: Inv[]; onClose: () => void }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');
  const { run, pending, error } = useAction();
  return (
    <Dialog title={`เบิกอะไหล่ / อุปกรณ์ · ${tid}`} onClose={onClose}>
      <div className="dialog-body">ระบบจะตัดสต็อกทันทีและบันทึกลงประวัติของงานซ่อมนี้</div>
      <div className="field"><label htmlFor="w-sku">สินค้า</label>
        <select id="w-sku" className="input" value={sku} onChange={e => setSku(e.target.value)}>
          <option value="">— เลือกสินค้า —</option>
          {inv.map(i => <option key={i.sku} value={i.sku}>{i.name} · คงเหลือ {i.qty} {i.unit}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="w-qty">จำนวน</label><input id="w-qty" className="input" type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => withdrawPart(tid, sku, qty), onClose)}>ยืนยันเบิก &amp; ตัดสต็อก</button>
      </div>
    </Dialog>
  );
}
