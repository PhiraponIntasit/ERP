'use client';
import { useState } from 'react';
import type { TicketView } from '@/server/views';
import { assignTicket } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { History, Thumbs, TicketBody, TicketHead } from '@/components/ticket-bits';
import css from './dispatch.module.css';

type Job = TicketView & { phone: string };
type Tech = { id: string; name: string; load: number };

const ACTIVE = ['assigned', 'progress', 'waiting'];
const FILTERS: [string, string, (t: Job) => boolean][] = [
  ['all', 'ทั้งหมด', () => true],
  ['new', 'รอมอบหมาย', t => t.status === 'new'],
  ['overdue', 'เกิน SLA', t => t.overdue],
  ['active', 'กำลังดำเนินการ', t => ACTIVE.includes(t.status)],
  ['resolved', 'รอผู้แจ้งยืนยัน', t => t.status === 'resolved'],
  ['closed', 'ปิดแล้ว', t => t.status === 'closed'],
];

export function DispatchBoard({ tickets, techs }: { tickets: Job[]; techs: Tech[] }) {
  const [tf, setTf] = useState('all');
  const count = (k: string) => tickets.filter((FILTERS.find(f => f[0] === k) ?? FILTERS[0])[2]).length;
  const stats: [string, string, number][] = [
    ['new', 'รอมอบหมาย', count('new')], ['overdue', 'เกิน SLA', count('overdue')],
    ['active', 'กำลังดำเนินการ', count('active')], ['resolved', 'รอผู้แจ้งยืนยัน', count('resolved')],
  ];
  const shown = tickets.filter((FILTERS.find(f => f[0] === tf) ?? FILTERS[0])[2]);

  return (
    <div className="anim-page stack-4">
      {/* Tapping a number jumps to that list — the quickest way in on a phone */}
      <div className={`stat-strip ${css.stats}`}>
        {stats.map(([k, label, value]) => (
          <button key={k} type="button" className={`${css.stat}${tf === k ? ' ' + css.statOn : ''}${k === 'overdue' && value ? ' ' + css.hot : ''}`}
            aria-pressed={tf === k} onClick={() => setTf(tf === k ? 'all' : k)}>
            <span className="card-kicker">{label}</span><span className="kpi-value">{value}</span>
          </button>
        ))}
      </div>
      <div className={css.filters} role="group" aria-label="กรองตามสถานะ">
        {FILTERS.map(([k, l]) => (
          <button key={k} className={`chip${tf === k ? ' on' : ''}`} aria-pressed={tf === k} onClick={() => setTf(k)}>{l} <span className="tnum">({count(k)})</span></button>
        ))}
      </div>
      {shown.map(t => <DispatchCard key={t.id} t={t} techs={techs} />)}
      {!shown.length && <div className="empty">ไม่มีคำร้องในสถานะนี้</div>}
    </div>
  );
}

function DispatchCard({ t, techs }: { t: Job; techs: Tech[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const { run, pending } = useAction({ errorAs: 'toast' });
  const val = pick ?? (t.assigneeId || '');
  const tel = t.phone.replace(/[^\d+]/g, '');
  const hot = t.urgent || t.overdue;
  return (
    <div className={`card tcard ${css.card}${hot ? ' ' + css.urgent : ''}`}>
      <TicketHead t={t} order="urg-first" />
      <TicketBody t={t} />
      <div className={css.who}>
        <div className={css.whoText}>
          <span>ผู้แจ้ง: <strong>{t.requester}</strong> ({t.dept})</span>
          <span className="muted">ประเภท: {t.catLabel} · Asset: {t.assetText}</span>
          <span className="muted">อะไหล่ที่เบิก: {t.parts.length ? t.parts.join(', ') : '—'}</span>
          {t.rating > 0 && <span style={{ color: 'var(--color-accent-700)' }}>คะแนน {t.ratingText}</span>}
        </div>
        {tel && <a className={`btn btn-secondary ${css.call}`} href={`tel:${tel}`} aria-label={`โทรหา ${t.requester} ${t.phone}`}><PhoneIcon /> โทร</a>}
      </div>
      <Thumbs t={t} />
      <div className={`divider-top ${css.assign}`}>
        <span className={css.owner}>ผู้รับผิดชอบ: <strong>{t.assigneeName}</strong></span>
        {t.status !== 'closed' && (
          <div className={css.assignRow}>
            <select className="input" value={val} aria-label="เลือกช่าง" onChange={e => setPick(e.target.value)}>
              <option value="">— เลือกช่าง IT Support —</option>
              {techs.map(u => <option key={u.id} value={u.id}>{u.name} · {u.load ? `งานค้าง ${u.load}` : 'ว่าง'}</option>)}
            </select>
            <button className={`btn btn-primary ${css.assignBtn}`} disabled={pending}
              onClick={() => run(() => assignTicket(t.id, val), () => setPick(null))}>
              {t.assigneeId ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายงาน'}
            </button>
          </div>
        )}
      </div>
      <History t={t} />
    </div>
  );
}

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
