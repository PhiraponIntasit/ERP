'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SerialInfo } from '@/server/warranty';
import { replace, rma } from '@/server/actions/warranty';
import { useAction } from '@/components/use-action';
import { Err } from '@/components/dialog';
import { ScanButton } from '@/components/barcode-scanner';

export function SerialSearch({ q }: { q: string }) {
  const router = useRouter();
  const [v, setV] = useState(q);
  const go = (s: string) => router.push(`/warranty?q=${encodeURIComponent(s.trim())}`);
  return (
    <form style={{ display: 'flex', gap: 8, maxWidth: 560 }} onSubmit={e => { e.preventDefault(); if (v.trim()) go(v); }}>
      <input className="input tnum" value={v} onChange={e => setV(e.target.value)} placeholder="Serial ของสินค้า" aria-label="ค้นหา Serial" autoCapitalize="characters" style={{ flex: 1 }} />
      <ScanButton label="สแกน Serial" onScan={s => { setV(s); go(s); }} />
      <button className="btn btn-primary">ตรวจสอบ</button>
    </form>
  );
}

export function WarrantyActions({ info }: { info: SerialInfo }) {
  const router = useRouter();
  const [newS, setNewS] = useState(''), [note, setNote] = useState(''), [ref, setRef] = useState('');
  const { run, pending, error } = useAction();
  if (info.status === 'sold' && info.inWarranty) return (
    <div className="card stack-4" style={{ background: 'transparent' }} aria-label="เปลี่ยนเครื่องใหม่">
      <div className="card-title" style={{ fontSize: 16 }}>เปลี่ยนเครื่องใหม่ให้ลูกค้า</div>
      <div className="grid2">
        <div className="field"><label htmlFor="w-new">Serial เครื่องใหม่ (จากสต็อก)</label>
          <input id="w-new" className="input tnum" list="w-spares" value={newS} onChange={e => setNewS(e.target.value)} autoCapitalize="characters" />
          <datalist id="w-spares">{info.spares.map(s => <option key={s} value={s} />)}</datalist>
          <div className="muted" style={{ fontSize: 12 }}>ในสต็อก {info.spares.length} เครื่อง</div></div>
        <div className="field"><label htmlFor="w-note">อาการเสีย / เลขที่เคลม</label><input id="w-note" className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={300} /></div>
      </div>
      <Err msg={error} />
      <div><button className="btn btn-primary" disabled={pending} onClick={() => run(() => replace(info.serial, newS, note), () => router.push(`/warranty?q=${encodeURIComponent(newS.trim().toUpperCase())}`))}>ยืนยันเปลี่ยนเครื่อง</button></div>
    </div>
  );
  if (info.status === 'claim') return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="field" style={{ margin: 0 }}><label htmlFor="w-rma">เลขที่ใบส่งคืน / RMA</label><input id="w-rma" className="input" value={ref} onChange={e => setRef(e.target.value)} maxLength={100} /></div>
      <button className="btn btn-primary" disabled={pending} onClick={() => run(() => rma(info.serial, ref))}>บันทึกส่งคืนผู้ขาย</button>
      <Err msg={error} />
    </div>
  );
  return null;
}
