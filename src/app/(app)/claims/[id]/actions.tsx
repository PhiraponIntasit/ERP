'use client';
import { useState } from 'react';
import { approve, receive, reject, repair } from '@/server/actions/claims';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';

type Part = { sku: string; name: string; free: number; unit: string };

export function ClaimActions({ id, status, spares, inWarranty, parts }: { id: string; status: string; spares: string[]; inWarranty: boolean; parts: Part[] }) {
  const [mode, setMode] = useState<'repair' | 'swap'>('swap');
  const [rows, setRows] = useState<{ sku: string; qty: string }[]>([]);
  const [fix, setFix] = useState('');
  const rep = useAction();
  const [dlg, setDlg] = useState<null | 'reject'>(null);
  const [newS, setNewS] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('');
  const main = useAction();
  const rej = useAction();
  return (
    <section className="card stack-4" aria-label="ดำเนินการเคลม" style={{ cursor: 'default', background: 'transparent' }}>
      {status === 'submitted' ? (
        <>
          <p style={{ margin: 0 }}>รอลูกค้าส่งสินค้ามาที่ร้าน เมื่อได้รับแล้วกด “รับเครื่องแล้ว” ระบบจะแจ้งลูกค้าทางอีเมล</p>
          <Err msg={main.error} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={main.pending} onClick={() => main.run(() => receive(id))}>รับเครื่องแล้ว</button>
            <button className="btn btn-secondary" onClick={() => setDlg('reject')}>ไม่อนุมัติ</button>
          </div>
        </>
      ) : (
        <>
          <div role="radiogroup" aria-label="ผลการตรวจ" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" role="radio" aria-checked={mode === 'swap'} className={`chip${mode === 'swap' ? ' on' : ''}`} onClick={() => setMode('swap')}>เปลี่ยนเครื่องใหม่</button>
            <button type="button" role="radio" aria-checked={mode === 'repair'} className={`chip${mode === 'repair' ? ' on' : ''}`} onClick={() => setMode('repair')}>ซ่อมแล้วคืนเครื่องเดิม</button>
            <button type="button" className="chip" onClick={() => setDlg('reject')}>ไม่อนุมัติ</button>
          </div>
          {!inWarranty && <p className="err" style={{ margin: 0 }}>เครื่องนี้หมดประกันแล้ว — ไม่อนุมัติพร้อมแจ้งเหตุผล</p>}
          {mode === 'repair' ? (
            <>
              <div className="card-title" style={{ fontSize: 16 }}>ซ่อม · คืนเครื่องเดิมให้ลูกค้า</div>
              <div className="field"><label htmlFor="cl-fix">สรุปการซ่อม (ส่งให้ลูกค้า)</label>
                <textarea id="cl-fix" className="input" rows={2} maxLength={500} value={fix} onChange={e => setFix(e.target.value)} placeholder="เช่น เปลี่ยนพัดลมระบายความร้อน ทดสอบ 24 ชม. ปกติ" /></div>
              <div className="stack-4" style={{ gap: 6 }} aria-label="อะไหล่ที่ใช้">
                {rows.map((r, k) => (
                  <div key={k} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select aria-label={`อะไหล่รายการที่ ${k + 1}`} className="input" style={{ flex: '1 1 240px' }} value={r.sku} onChange={e => setRows(rows.map((x, i) => (i === k ? { ...x, sku: e.target.value } : x)))}>
                      <option value="">— เลือกอะไหล่ —</option>
                      {parts.map(p => <option key={p.sku} value={p.sku}>{p.name} (เหลือ {p.free} {p.unit})</option>)}
                    </select>
                    <input aria-label={`จำนวนรายการที่ ${k + 1}`} className="input tnum" type="number" min={1} max={99} style={{ width: 90 }} value={r.qty} onChange={e => setRows(rows.map((x, i) => (i === k ? { ...x, qty: e.target.value } : x)))} />
                    <button type="button" className="btn btn-secondary" onClick={() => setRows(rows.filter((_, i) => i !== k))} aria-label={`ลบอะไหล่รายการที่ ${k + 1}`}>ลบ</button>
                  </div>
                ))}
                <div><button type="button" className="btn btn-secondary" onClick={() => setRows([...rows, { sku: '', qty: '1' }])}>+ เพิ่มอะไหล่จากสต็อก</button></div>
              </div>
              <Err msg={rep.error} />
              <div><button className="btn btn-primary" disabled={rep.pending || !inWarranty}
                onClick={() => rep.run(() => repair(id, Object.fromEntries(rows.filter(r => r.sku).map(r => [r.sku, r.qty])), fix))}>ปิดเคลม · ซ่อมคืนเครื่องเดิม</button></div>
            </>
          ) : (
            <>
          <div className="card-title" style={{ fontSize: 16 }}>อนุมัติ · เปลี่ยนเครื่องใหม่จากสต็อก</div>
          <div className="grid2">
            <div className="field"><label htmlFor="cl-new">Serial เครื่องใหม่</label>
              <input id="cl-new" className="input tnum" list="cl-spares" value={newS} onChange={e => setNewS(e.target.value)} autoCapitalize="characters" />
              <datalist id="cl-spares">{spares.map(s => <option key={s} value={s} />)}</datalist>
              <div className="muted" style={{ fontSize: 12 }}>สินค้ารุ่นเดียวกันในสต็อก {spares.length} เครื่อง</div></div>
            <div className="field"><label htmlFor="cl-note">หมายเหตุถึงลูกค้า (เช่น เลขพัสดุส่งเครื่องใหม่)</label><input id="cl-note" className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={300} /></div>
          </div>
          <Err msg={main.error} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={main.pending || !inWarranty} onClick={() => main.run(() => approve(id, newS, note))}>อนุมัติและเปลี่ยนเครื่อง</button>
          </div>
            </>
          )}
        </>
      )}
      {dlg === 'reject' && (
        <Dialog title={`ไม่อนุมัติเคลม ${id}`} className="w560" onClose={() => setDlg(null)}>
          <div className="field"><label htmlFor="cl-reason">เหตุผล (ส่งให้ลูกค้าทางอีเมล)</label>
            <textarea id="cl-reason" className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="เช่น ตรวจพบรอยไหม้จากไฟเกิน ไม่อยู่ในเงื่อนไขการรับประกัน" /></div>
          <Err msg={rej.error} />
          <div className="dialog-actions">
            <button className="btn btn-secondary" onClick={() => setDlg(null)}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={rej.pending} onClick={() => rej.run(() => reject(id, reason), () => setDlg(null))}>ยืนยันไม่อนุมัติ</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
