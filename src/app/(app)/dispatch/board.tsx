'use client';
import { useState } from 'react';
import type { TicketView } from '@/server/views';
import { assignTicket } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { Thumbs, TicketBody, TicketHead } from '@/components/ticket-bits';

const FILTERS: [string, string, (t: TicketView) => boolean][] = [
  ['all', 'ทั้งหมด', () => true],
  ['new', 'รอมอบหมาย', t => t.status === 'new'],
  ['active', 'กำลังดำเนินการ', t => ['assigned', 'progress', 'waiting'].includes(t.status)],
  ['resolved', 'รอผู้แจ้งยืนยัน', t => t.status === 'resolved'],
  ['closed', 'ปิดแล้ว', t => t.status === 'closed'],
];

export function DispatchBoard({ tickets, techs }: { tickets: TicketView[]; techs: { id: string; name: string; load: number }[] }) {
  const [tf, setTf] = useState('all');
  const [pick, setPick] = useState<Record<string, string>>({});
  const { run, pending } = useAction({ errorAs: 'toast' });
  const n = (s: string[]) => tickets.filter(t => s.includes(t.status)).length;
  const stats: [string, number][] = [['รอมอบหมาย', n(['new'])], ['กำลังดำเนินการ', n(['assigned', 'progress'])], ['รออะไหล่', n(['waiting'])], ['รอผู้แจ้งยืนยัน', n(['resolved'])]];
  const shown = tickets.filter((FILTERS.find(f => f[0] === tf) ?? FILTERS[0])[2]);

  return (
    <div className="anim-page stack-4">
      <div className="stat-strip">
        {stats.map(([label, value]) => (
          <div key={label}><div className="card-kicker">{label}</div><div className="kpi-value">{value}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(([k, l, fn]) => (
          <button key={k} className={`chip${tf === k ? ' on' : ''}`} aria-pressed={tf === k} onClick={() => setTf(k)}>{l} <span className="tnum">({tickets.filter(fn).length})</span></button>
        ))}
      </div>
      {shown.map(t => {
        const val = pick[t.id] ?? (t.assigneeId || '');
        return (
          <div key={t.id} className="card tcard" style={{ borderTop: `2px solid ${t.urgent ? 'var(--color-accent)' : 'var(--color-divider)'}` }}>
            <TicketHead t={t} order="urg-first" />
            <TicketBody t={t} />
            <div className="meta-line">
              <span>ผู้แจ้ง: {t.requester} ({t.dept})</span><span>ประเภท: {t.catLabel}</span><span>Asset: {t.assetText}</span>
              <span>อะไหล่ที่เบิก: {t.parts.length ? t.parts.join(', ') : '—'}</span>
              {t.rating > 0 && <span style={{ color: 'var(--color-accent-700)' }}>คะแนน {t.ratingText}</span>}
            </div>
            <Thumbs t={t} />
            <div className="divider-top" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>ผู้รับผิดชอบ: <strong style={{ fontWeight: 500 }}>{t.assigneeName}</strong></span>
              {t.status !== 'closed' && (
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <select className="input" style={{ width: 300, maxWidth: '100%' }} value={val} aria-label="เลือกช่าง" onChange={e => setPick(p => ({ ...p, [t.id]: e.target.value }))}>
                    <option value="">— เลือกช่าง IT Support —</option>
                    {techs.map(u => <option key={u.id} value={u.id}>{u.name} · งานค้าง {u.load}</option>)}
                  </select>
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => run(() => assignTicket(t.id, val), () => setPick(p => { const q = { ...p }; delete q[t.id]; return q; }))}>
                    {t.assigneeId ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายงาน'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!shown.length && <div className="empty">ไม่มีคำร้องในสถานะนี้</div>}
    </div>
  );
}
