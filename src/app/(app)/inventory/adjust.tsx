'use client';
import { useEffect, useState } from 'react';
import { adjust, serialsOnShelf } from '@/server/actions/stock';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import type { InvItem } from '@/components/procurement';
import { bahtS } from '@/lib/domain';

const KINDS = [['damaged', 'ชำรุด / ตัดของเสีย'], ['lost', 'สูญหาย'], ['count', 'ตรวจนับ']] as const;

/** Write off damaged or lost units, or set the quantity from a physical count. */
export function AdjustDialog({ item, onClose }: { item: InvItem; onClose: () => void }) {
  const [kind, setKind] = useState<'damaged' | 'lost' | 'count'>(item.serialTracked ? 'damaged' : 'count');
  const [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const [shelf, setShelf] = useState<string[] | null>(null), [picked, setPicked] = useState<string[]>([]);
  const { run, pending, error } = useAction();
  const free = item.qty - item.reserved;
  useEffect(() => { if (item.serialTracked) serialsOnShelf(item.sku).then(setShelf).catch(() => setShelf([])); }, [item.sku, item.serialTracked]);

  const n = item.serialTracked ? picked.length : parseInt(amount, 10);
  const delta = kind === 'count' ? (Number.isFinite(n) ? n - item.qty : 0) : -(Number.isFinite(n) ? n : 0);
  const amt = item.serialTracked ? String(picked.length) : amount;
  return (
    <Dialog title={`ปรับยอดสต็อก · ${item.name}`} className="w560" onClose={onClose}>
      <p style={{ margin: 0 }} className="tnum">ในระบบ {item.qty} {item.unit} · ขายได้ {free}{item.reserved > 0 && ` · จองให้คำสั่งซื้อที่รอชำระ ${item.reserved}`}</p>
      <div className="field">
        <span id="adj-kind-l">ประเภท</span>
        <div role="radiogroup" aria-labelledby="adj-kind-l" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.filter(([k]) => !(item.serialTracked && k === 'count')).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
      </div>
      {item.serialTracked ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBottom: 6 }}>เลือก Serial ที่ตัดออก ({picked.length})</legend>
          {shelf == null ? <span className="muted">กำลังโหลด…</span> : shelf.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4, maxHeight: 220, overflow: 'auto' }}>
              {shelf.map(s => (
                <label key={s} className="tnum" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                  <input type="checkbox" checked={picked.includes(s)} onChange={e => setPicked(e.target.checked ? [...picked, s] : picked.filter(x => x !== s))} />{s}
                </label>
              ))}
            </div>
          ) : <span className="muted">ไม่มี Serial อยู่ในสต็อก</span>}
        </fieldset>
      ) : (
        <div className="field"><label htmlFor="adj-n">{kind === 'count' ? 'จำนวนที่นับได้จริง' : 'จำนวนที่ตัดออก'}</label>
          <input id="adj-n" className="input tnum" type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /></div>
      )}
      <div className="field"><label htmlFor="adj-why">เหตุผล</label>
        <input id="adj-why" className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
          placeholder={kind === 'count' ? 'เช่น ตรวจนับประจำเดือน พ.ย.' : kind === 'lost' ? 'เช่น ตรวจไม่พบระหว่างย้ายชั้นวาง' : 'เช่น กล่องเปียกน้ำ ขั้วเสียหาย'} /></div>
      {delta !== 0 && <p style={{ margin: 0 }} className="tnum" data-testid="adj-preview">ยอดจะเปลี่ยน {item.qty} → {item.qty + delta} ({delta > 0 ? '+' : '−'}{Math.abs(delta)}) · มูลค่าทุน {bahtS(Math.abs(delta) * item.cost)}</p>}
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => adjust(item.sku, kind, amt, reason, picked), onClose)}>บันทึกปรับยอด</button>
      </div>
    </Dialog>
  );
}
