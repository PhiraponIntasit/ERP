'use client';
import { useState } from 'react';
import type { AssetRow } from '@/server/assets';
import { registerAsset, returnAsset } from '@/server/actions/people';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { ASSET_TYPES } from '@/lib/domain';
import css from '@/components/people-tables.module.css';

const FILTERS: [string, string, (a: AssetRow) => boolean][] = [
  ['all', 'ทั้งหมด', () => true], ['inuse', 'ถือครองอยู่', a => !!a.holderId], ['free', 'ว่างในคลัง IT', a => !a.holderId], ['warranty', 'ประกันใกล้หมด / หมดแล้ว', a => a.warn],
];

export function AssetsView({ rows, emps }: { rows: AssetRow[]; emps: { id: string; name: string; dept: string }[] }) {
  const [q, setQ] = useState(''), [af, setAf] = useState('all');
  const [dlg, setDlg] = useState<null | { type: 'new' } | { type: 'hist'; tag: string }>(null);
  const s = q.trim().toLowerCase();
  const shown = rows.filter((FILTERS.find(f => f[0] === af) ?? FILTERS[0])[2]).filter(a => !s || (a.tag + a.model + a.type + a.serialText + (a.holderId ? a.holderName : '')).toLowerCase().includes(s));
  const hist = dlg?.type === 'hist' ? rows.find(r => r.tag === dlg.tag) : undefined;
  return (
    <div className="anim-page stack-4">
      <div className={`toolbar ${css.toolbar}`}>
        <input className={`input ${css.search}`} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา Tag, รุ่น, Serial, ผู้ถือครอง" aria-label="ค้นหาอุปกรณ์" />
        <div className={css.chips} role="group" aria-label="กรองอุปกรณ์">
          {FILTERS.map(([k, l, fn]) => <button key={k} className={`chip sm${af === k ? ' on' : ''}`} aria-pressed={af === k} onClick={() => setAf(k)}>{l} <span className="tnum">({rows.filter(fn).length})</span></button>)}
        </div>
        <button className="btn btn-primary ml-auto" onClick={() => setDlg({ type: 'new' })}>+ ลงทะเบียนอุปกรณ์</button>
      </div>
      <div className="scroll-x">
        <table className={`table ${css.cards}`}>
          <thead><tr><th>Asset Tag</th><th>อุปกรณ์</th><th>ผู้ถือครอง</th><th>ประกันถึง</th><th className="r">แจ้งซ่อม</th><th></th></tr></thead>
          <tbody>
            {shown.map(a => (
              <tr key={a.tag}>
                <td className={`tnum ${css.side}`} style={{ fontSize: 13 }}>{a.tag}</td>
                <td className={css.main}>{a.type} · {a.model}<div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>S/N {a.serialText}</div></td>
                <td data-label="ผู้ถือครอง" style={{ color: a.holderId ? 'var(--color-text)' : 'var(--color-neutral-700)' }}><div>{a.holderName}<div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{a.holderDept}</div></div></td>
                <td data-label="ประกันถึง" className="tnum" style={{ fontSize: 13 }}><div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span>{a.warrantyText}</span>{a.warn && <span className={`tag ${a.expired ? 'tag-neutral' : 'tag-outline'}`}>{a.warnLabel}</span>}</div></td>
                <td data-label="แจ้งซ่อม" className="r tnum"><span>{a.repairCount}<span className={css.unit}> ครั้ง</span></span></td>
                <td className={`r ${css.actions}`}><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={() => setDlg({ type: 'hist', tag: a.tag })}>ประวัติ</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg?.type === 'new' && <NewAssetDialog emps={emps} onClose={() => setDlg(null)} />}
      {hist && <HistDialog a={hist} onClose={() => setDlg(null)} />}
    </div>
  );
}

function NewAssetDialog({ emps, onClose }: { emps: { id: string; name: string; dept: string }[]; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ type: 'Notebook', holder: '' });
  const { run, pending, error } = useAction();
  const inp = (k: string, label: string, type = 'text', ph = '', cls = '') => <div className={`field ${cls}`}><label htmlFor={'na-' + k}>{label}</label><input id={'na-' + k} className="input" type={type} value={f[k] ?? ''} placeholder={ph} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} /></div>;
  return (
    <Dialog title="ลงทะเบียนอุปกรณ์" className={`w560 ${css.dlg}`} onClose={onClose}>
      <div className="grid2">
        {inp('tag', 'Asset Tag', 'text', 'NB-0131')}
        <div className="field"><label htmlFor="na-type">ประเภท</label><select id="na-type" className="input" value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value }))}>{ASSET_TYPES.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        {inp('model', 'รุ่น', 'text', '', 'full')}
        {inp('serial', 'Serial Number')}
        {inp('warranty', 'ประกันหมดวันที่', 'date')}
        <div className="field full"><label htmlFor="na-holder">ส่งมอบให้</label>
          <select id="na-holder" className="input" value={f.holder} onChange={e => setF(x => ({ ...x, holder: e.target.value }))}>
            <option value="">— ยังไม่ส่งมอบ (เก็บในคลัง IT) —</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.dept})</option>)}
          </select>
        </div>
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => registerAsset(f), onClose)}>บันทึก</button>
      </div>
    </Dialog>
  );
}

function HistDialog({ a, onClose }: { a: AssetRow; onClose: () => void }) {
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <Dialog title={`${a.tag} · ${a.type} ${a.model}`} className={`w640 ${css.dlg}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 18px', fontSize: 14 }}>
        <span className="muted">Serial</span><span className="tnum">{a.serialText}</span>
        <span className="muted">ผู้ถือครอง</span><span>{a.holderId ? `${a.holderName} · ${a.holderDept}` : a.holderName}</span>
        <span className="muted">ประกันถึง</span><span className="tnum">{a.warrantyText}{a.warn ? ` (${a.warnLabel})` : ''}</span>
        <span className="muted">แจ้งซ่อมแล้ว</span><span className="tnum">{a.repairCount} ครั้ง</span>
      </div>
      <div className="eyebrow" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>ประวัติการแจ้งซ่อม</div>
      <div className="col">
        {a.tickets.map(t => (
          <div key={t.id} className={css.ticket} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
            <span className="tnum">{t.id}</span><span>{t.title}<span className="muted"> · {t.dText}</span></span><span className={`tag ${t.statusTag}`}>{t.statusLabel}</span>
          </div>
        ))}
        {!a.tickets.length && <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>ยังไม่เคยแจ้งซ่อม</div>}
      </div>
      <div className="eyebrow" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>ประวัติการถือครอง</div>
      <div className="col">
        {a.hist.map((x, i) => <div key={i} className={css.hist} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, padding: '5px 0', fontSize: 13 }}><span className="muted tnum">{x.tText}</span><span>{x.text} — {x.by}</span></div>)}
      </div>
      <div className="dialog-actions">
        {a.holderId && <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => returnAsset(a.tag))}>รับคืนเข้าคลัง IT</button>}
        <button className="btn btn-primary" onClick={onClose}>ปิด</button>
      </div>
    </Dialog>
  );
}
