'use client';
import { useRef, useState } from 'react';
import { addNote, assign } from '@/server/actions/claims';
import { useAction } from '@/components/use-action';
import { Err } from '@/components/dialog';
import type { ClaimTimeline } from '@/server/claim-service';

type Staff = { id: string; name: string; role: string };

/** Who inspects the unit, and the service log (staff view: internal lines included, marked). */
export function ServicePanel({ id, open, tl, staff, roleLabel }: { id: string; open: boolean; tl: ClaimTimeline; staff: Staff[]; roleLabel: Record<string, string> }) {
  const [who, setWho] = useState(tl.assigneeId ?? '');
  const [text, setText] = useState('');
  const [pub, setPub] = useState(true);
  const files = useRef<HTMLInputElement>(null);
  const as = useAction(), note = useAction();
  const save = () => {
    const fd = new FormData();
    fd.set('text', text);
    if (pub) fd.set('public', 'on');
    for (const f of Array.from(files.current?.files ?? [])) fd.append('photos', f);
    note.run(() => addNote(id, fd), () => { setText(''); if (files.current) files.current.value = ''; });
  };
  return (
    <section className="card stack-4" aria-labelledby="svc-h" style={{ cursor: 'default' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 id="svc-h" className="card-title" style={{ fontSize: 16, margin: 0 }}>งานบริการ</h3>
        {tl.ageDays != null && <span className={`tag ${tl.overdue ? 'tag-outline' : 'tag-neutral'}`} data-testid="claim-age">{tl.overdue ? 'เกินกำหนด · ' : ''}รับเครื่องมาแล้ว {tl.ageDays} วัน</span>}
      </div>
      {open ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 240px', margin: 0 }}>
            <label htmlFor="cl-assignee">ช่างผู้ตรวจสอบ</label>
            <select id="cl-assignee" className="input" value={who} onChange={e => setWho(e.target.value)}>
              <option value="">— ยังไม่มอบหมาย —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} · {roleLabel[s.role] ?? s.role}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" disabled={as.pending || who === (tl.assigneeId ?? '')} onClick={() => as.run(() => assign(id, who))}>มอบหมาย</button>
        </div>
      ) : <p style={{ margin: 0 }}>ช่างผู้ตรวจสอบ: {tl.assignee ?? '—'}</p>}
      <Err msg={as.error} />

      <ol className="stack-4" aria-label="บันทึกงานเคลม" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 12 }}>
        {tl.lines.map(l => (
          <li key={l.key} data-internal={l.internal ? 'true' : undefined} style={{ borderLeft: `3px solid ${l.internal ? 'var(--color-neutral-400)' : 'var(--color-accent)'}`, paddingLeft: 12 }}>
            <div className="muted tnum" style={{ fontSize: 12 }}>{l.tText} · {l.by}{l.internal && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>ภายใน</span>}</div>
            <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{l.text}</div>
            {l.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {l.photos.map(p => <a key={p.id} href={p.src} target="_blank" rel="noreferrer"><img src={p.src} alt={p.name} width={88} height={88} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-divider)' }} /></a>)}
              </div>
            )}
          </li>
        ))}
      </ol>

      {open && (
        <div className="stack-4" style={{ gap: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cl-log">บันทึกผลตรวจ / ความคืบหน้า</label>
            <textarea id="cl-log" className="input" rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="เช่น ทดสอบกับเมนบอร์ดสำรองแล้ว อาการเดิม · สั่งพัดลมทดแทน" />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="cl-photos" className="muted" style={{ fontSize: 13 }}>แนบรูป</label>
            <input id="cl-photos" ref={files} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} /> ให้ลูกค้าเห็นในหน้าเคลม
            </label>
            <button className="btn btn-primary ml-auto" disabled={note.pending} onClick={save}>บันทึก</button>
          </div>
          <Err msg={note.error} />
        </div>
      )}
    </section>
  );
}
