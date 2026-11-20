'use client';
import { useState } from 'react';
import { approve, receive, reject } from '@/server/actions/claims';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';

export function ClaimActions({ id, status, spares, inWarranty }: { id: string; status: string; spares: string[]; inWarranty: boolean }) {
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
          <div className="card-title" style={{ fontSize: 16 }}>อนุมัติ · เปลี่ยนเครื่องใหม่จากสต็อก</div>
          {!inWarranty && <p className="err" style={{ margin: 0 }}>เครื่องนี้หมดประกันแล้ว เปลี่ยนเครื่องไม่ได้ — ไม่อนุมัติพร้อมแจ้งเหตุผล</p>}
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
            <button className="btn btn-secondary" onClick={() => setDlg('reject')}>ไม่อนุมัติ</button>
          </div>
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
