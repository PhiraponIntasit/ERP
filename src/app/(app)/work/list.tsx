'use client';
import { useState } from 'react';
import type { TicketView } from '@/server/views';
import { updateTicketStatus, withdrawPart } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { History, Thumbs, TicketBody, TicketHead } from '@/components/ticket-bits';
import { MAX_PHOTOS, shrink, type Img } from '@/components/photo-shrink';
import { CameraIcon } from '@/components/category-icons';
import { XIcon } from '@/components/icons';
import css from './work.module.css';

type Inv = { sku: string; name: string; qty: number; unit: string };
type Job = TicketView & { phone: string };

/** Short labels for the status buttons (the tags keep the full wording). */
const STATUS_BTN: [string, string][] = [['assigned', 'มอบหมายแล้ว'], ['progress', 'กำลังทำ'], ['waiting', 'รออะไหล่'], ['resolved', 'แก้ไขเสร็จ']];
const FILTERS: [string, string, (t: Job) => boolean][] = [
  ['all', 'ทั้งหมด', () => true],
  ['assigned', 'งานใหม่', t => t.status === 'assigned'],
  ['progress', 'กำลังทำ', t => t.status === 'progress'],
  ['waiting', 'รออะไหล่', t => t.status === 'waiting'],
  ['resolved', 'รอผู้แจ้งยืนยัน', t => t.status === 'resolved'],
];

export function WorkList({ tickets, inv, showAssignee }: { tickets: Job[]; inv: Inv[]; showAssignee: boolean }) {
  const [withdrawFor, setWithdrawFor] = useState<string | null>(null);
  const [tf, setTf] = useState('all');
  const shown = tickets.filter((FILTERS.find(f => f[0] === tf) ?? FILTERS[0])[2]);
  return (
    <div className="anim-page stack-4">
      {tickets.length > 0 && (
        <div className={css.filters} role="group" aria-label="กรองตามสถานะ">
          {FILTERS.map(([k, l, fn]) => (
            <button key={k} className={`chip${tf === k ? ' on' : ''}`} aria-pressed={tf === k} onClick={() => setTf(k)}>{l} <span className="tnum">({tickets.filter(fn).length})</span></button>
          ))}
        </div>
      )}
      {!tickets.length && <div className="empty">ยังไม่มีงานที่ได้รับมอบหมาย</div>}
      {tickets.length > 0 && !shown.length && <div className="empty">ไม่มีงานในสถานะนี้</div>}
      {shown.map(t => <WorkCard key={t.id} t={t} showAssignee={showAssignee} onWithdraw={() => setWithdrawFor(t.id)} />)}
      {withdrawFor && <WithdrawDialog tid={withdrawFor} inv={inv} onClose={() => setWithdrawFor(null)} />}
    </div>
  );
}

function WorkCard({ t, showAssignee, onWithdraw }: { t: Job; showAssignee: boolean; onWithdraw: () => void }) {
  const [status, setStatus] = useState(t.status);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Img[]>([]);
  const { run, pending } = useAction({ errorAs: 'toast' });
  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]; e.target.value = '';
    const out = (await Promise.all(files.slice(0, MAX_PHOTOS - photos.length).map(shrink))).filter((x): x is Img => !!x);
    setPhotos(cur => [...cur, ...out].slice(0, MAX_PHOTOS));
  };
  const dropPhoto = (i: number) => setPhotos(cur => { URL.revokeObjectURL(cur[i].src); return cur.filter((_, k) => k !== i); });
  const save = () => {
    let fd: FormData | undefined;
    if (photos.length) { fd = new FormData(); photos.forEach((p, i) => fd!.append('photos', p.blob, `work-${i + 1}.jpg`)); }
    run(() => updateTicketStatus(t.id, status, note, fd), () => { setNote(''); photos.forEach(p => URL.revokeObjectURL(p.src)); setPhotos([]); });
  };
  const tel = t.phone.replace(/[^\d+]/g, '');
  return (
    <div className={`card tcard ${css.card}`}>
      <TicketHead t={t} order="urg-first" />
      <TicketBody t={t} />
      <div className={css.who}>
        <div className={css.whoText}>
          <span>ผู้แจ้ง: <strong>{t.requester}</strong> ({t.dept})</span>
          <span className="muted">ประเภท: {t.catLabel} · Asset: {t.assetText}{showAssignee ? ` · ช่าง: ${t.assigneeName}` : ''}</span>
        </div>
        {tel && <a className={`btn btn-secondary ${css.call}`} href={`tel:${tel}`} aria-label={`โทรหา ${t.requester} ${t.phone}`}><PhoneIcon /> โทร</a>}
      </div>
      <Thumbs t={t} />
      <div className={css.parts}>
        <span className="muted">อะไหล่ที่เบิกแล้ว:</span>
        {t.parts.map(p => <span key={p} className="tag tag-neutral">{p}</span>)}
        {!t.parts.length && <span>—</span>}
        {t.status === 'resolved'
          ? <span className={`muted ${css.withdrawNote}`}>แจ้งว่าแก้ไขเสร็จแล้ว — เปลี่ยนเป็น “กำลังทำ” เพื่อเบิกเพิ่ม</span>
          : <button className={`btn btn-ghost ${css.withdrawBtn}`} onClick={onWithdraw}>+ เบิกอะไหล่ / อุปกรณ์จากคลัง</button>}
      </div>
      <div className={`divider-top ${css.update}`}>
        <div className={css.statuses} role="radiogroup" aria-label="สถานะ">
          {STATUS_BTN.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={status === k} className={`choice sm${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>
              {l}{k === t.status && <span className={css.now}>ตอนนี้</span>}
            </button>
          ))}
        </div>
        <div className={css.photoRow}>
          {photos.map((p, i) => (
            <div key={p.src} className={css.photo}>
              <div className="plate plate-img" style={{ backgroundImage: `url(${p.src})` }} />
              <button type="button" className={css.photoX} onClick={() => dropPhoto(i)} aria-label={`ลบรูปที่ ${i + 1}`}><XIcon size={12} /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={`btn btn-secondary ${css.addPhoto}`}>
              <CameraIcon size={16} /> แนบรูป{photos.length ? ` (${photos.length}/${MAX_PHOTOS})` : ''}
              <input type="file" accept="image/*" multiple onChange={addPhotos} hidden aria-label="แนบรูปการทำงาน" />
            </label>
          )}
        </div>
        <div className={css.noteRow}>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="บันทึกการทำงาน (ถ้ามี)" aria-label="บันทึกการทำงาน" enterKeyHint="done" />
          <button className={`btn btn-primary ${css.save}`} disabled={pending} onClick={save}>อัปเดตสถานะ</button>
        </div>
      </div>
      <History t={t} />
    </div>
  );
}

function WithdrawDialog({ tid, inv, onClose }: { tid: string; inv: Inv[]; onClose: () => void }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');
  const { run, pending, error } = useAction();
  const item = inv.find(i => i.sku === sku);
  const n = parseInt(qty, 10) || 0;
  const step = (d: number) => setQty(String(Math.max(1, Math.min(item?.qty ?? 9999, n + d))));
  return (
    <Dialog title={`เบิกอะไหล่ / อุปกรณ์ · ${tid}`} onClose={onClose} className={css.dlg}>
      <div className="dialog-body">ระบบจะตัดสต็อกทันทีและบันทึกลงประวัติของงานซ่อมนี้</div>
      <div className="field"><label htmlFor="w-sku">สินค้า</label>
        <select id="w-sku" className="input" value={sku} onChange={e => setSku(e.target.value)}>
          <option value="">— เลือกสินค้า —</option>
          {inv.map(i => <option key={i.sku} value={i.sku}>{i.name} · คงเหลือ {i.qty} {i.unit}</option>)}
        </select>
        {item && <div className={css.stock}>คงเหลือในคลัง {item.qty} {item.unit}{n > 0 && n <= item.qty ? ` · หลังเบิกเหลือ ${item.qty - n}` : ''}</div>}
      </div>
      <div className="field"><label htmlFor="w-qty">จำนวน</label>
        <div className={css.stepper}>
          <button type="button" className="btn btn-secondary" onClick={() => step(-1)} disabled={n <= 1} aria-label="ลดจำนวน">−</button>
          <input id="w-qty" className="input tnum" type="number" inputMode="numeric" min={1} value={qty} onChange={e => setQty(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={() => step(1)} disabled={!!item && n >= item.qty} aria-label="เพิ่มจำนวน">+</button>
        </div>
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => withdrawPart(tid, sku, qty), onClose)}>ยืนยันเบิก &amp; ตัดสต็อก</button>
      </div>
    </Dialog>
  );
}

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
