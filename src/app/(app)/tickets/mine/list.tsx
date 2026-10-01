'use client';
import { useState } from 'react';
import type { TicketView } from '@/server/views';
import { confirmClose, reopenTicket } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { StarIcon } from '@/components/icons';
import { History, Steps, Thumbs, TicketBody, TicketHead } from '@/components/ticket-bits';

const RATE_LABEL = ['', 'ต้องปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'];

export function MyTicketList({ tickets }: { tickets: TicketView[] }) {
  const [rateFor, setRateFor] = useState<string | null>(null);
  const reopen = useAction({ errorAs: 'toast' });
  return (
    <div className="anim-page stack-4">
      {!tickets.length && <div className="empty">คุณยังไม่มีคำร้อง</div>}
      {tickets.map(t => (
        <div key={t.id} className="card tcard">
          <TicketHead t={t} />
          <TicketBody t={t} titleSize={22} />
          <Steps t={t} />
          <div className="meta-line">
            <span>ประเภท: {t.catLabel}</span><span>Asset: {t.assetText}</span><span>ผู้รับผิดชอบ: {t.assigneeName}</span>
            {t.rating > 0 && <span style={{ color: 'var(--color-accent-700)' }}>คะแนน {t.ratingText}</span>}
          </div>
          <Thumbs t={t} />
          <History t={t} />
          {t.status === 'resolved' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: 13, minWidth: 240 }}>ช่างแจ้งว่าแก้ไขเสร็จแล้ว — ตรวจสอบแล้วใช้งานได้ปกติหรือไม่?</span>
              <button className="btn btn-secondary" disabled={reopen.pending} onClick={() => reopen.run(() => reopenTicket(t.id))}>ยังไม่หาย</button>
              <button className="btn btn-primary" onClick={() => setRateFor(t.id)}>ยืนยันปิดงาน</button>
            </div>
          )}
        </div>
      ))}
      {rateFor && <RateDialog tid={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function RateDialog({ tid, onClose }: { tid: string; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const { run, pending, error, setError } = useAction();
  return (
    <Dialog title={`ยืนยันปิดงาน · ${tid}`} onClose={onClose}>
      <div className="dialog-body">ให้คะแนนความพึงพอใจต่อการให้บริการ คะแนนนี้ใช้ประเมินคุณภาพงานของทีม IT</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="radiogroup" aria-label="คะแนน">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className="star" title={`${n} ดาว`} aria-label={`${n} ดาว`} role="radio" aria-checked={rating === n}
            style={{ color: n <= rating ? 'var(--color-accent-700)' : 'var(--color-neutral-600)' }} onClick={() => { setRating(n); setError(''); }}>
            <StarIcon filled={n <= rating} />
          </button>
        ))}
        <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--color-accent-700)' }}>{RATE_LABEL[rating]}</span>
      </div>
      <div className="field"><label htmlFor="rnote">ความคิดเห็นเพิ่มเติม (ถ้ามี)</label><textarea id="rnote" className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => rating ? run(() => confirmClose(tid, rating, note), onClose) : setError('กรุณาให้คะแนน 1–5 ดาว')}>ยืนยันปิดงาน</button>
      </div>
    </Dialog>
  );
}
