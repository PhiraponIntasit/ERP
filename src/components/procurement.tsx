'use client';
import { useState } from 'react';
import type { PRView } from '@/server/views';
import { addItem, createPR, receiveStock } from '@/server/actions/stock';
import { useAction } from './use-action';
import { Dialog, Err } from './dialog';
import { PrinterIcon } from './icons';
import { baht, bahtS } from '@/lib/domain';

export type InvItem = { sku: string; name: string; cat: string; unit: string; qty: number; min: number; price: number; loc: string; inPR: boolean };

export function ReceiveDialog({ items, sku: sku0 = '', onClose }: { items: InvItem[]; sku?: string; onClose: () => void }) {
  const [sku, setSku] = useState(sku0), [qty, setQty] = useState(''), [note, setNote] = useState('');
  const { run, pending, error } = useAction();
  return (
    <Dialog title="รับสินค้าเข้า / เพิ่มสต็อก" onClose={onClose}>
      <div className="field"><label htmlFor="r-sku">สินค้า</label>
        <select id="r-sku" className="input" value={sku} onChange={e => setSku(e.target.value)}>
          <option value="">— เลือกสินค้า —</option>
          {items.map(i => <option key={i.sku} value={i.sku}>{i.name} · คงเหลือ {i.qty} {i.unit}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="r-qty">จำนวนที่รับเข้า</label><input id="r-qty" className="input" type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></div>
      <div className="field"><label htmlFor="r-note">อ้างอิง / หมายเหตุ</label><input id="r-note" className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="เช่น เลขที่ใบส่งของ" /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => receiveStock(sku, qty, note), onClose)}>บันทึกรับเข้า</button>
      </div>
    </Dialog>
  );
}

export function AddItemDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ unit: 'ชิ้น', qty: '0', min: '2', price: '' });
  const { run, pending, error } = useAction();
  const inp = (k: string, label: string, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`field${k === 'name' ? ' full' : ''}`}><label htmlFor={'ai-' + k}>{label}</label><input id={'ai-' + k} className="input" type={type} value={f[k] ?? ''} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} {...extra} /></div>
  );
  return (
    <Dialog title="เพิ่มรายการสินค้าใหม่" className="w560" onClose={onClose}>
      <div className="grid2">
        {inp('sku', 'SKU', 'text', { placeholder: 'เช่น SSD-512', maxLength: 32 })}
        {inp('cat', 'หมวด')}
        {inp('name', 'ชื่อสินค้า')}
        {inp('unit', 'หน่วย')}
        {inp('loc', 'ที่เก็บ')}
        {inp('qty', 'จำนวนตั้งต้น', 'number', { min: 0 })}
        {inp('min', 'จุดสั่งซื้อ (ขั้นต่ำ)', 'number', { min: 0 })}
        {inp('price', 'ราคา/หน่วย (บาท)', 'number', { min: 0, step: '0.01' })}
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => addItem(f), onClose)}>บันทึก</button>
      </div>
    </Dialog>
  );
}

/** PR form: low-stock items without an open PR come pre-filled with (reorder point × factor − on hand). */
export function PRDialog({ items, factor, onClose }: { items: InvItem[]; factor: number; onClose: () => void }) {
  const [lines, setLines] = useState<Record<string, string>>(() => Object.fromEntries(items.filter(i => i.qty <= i.min && !i.inPR).map(i => [i.sku, String(Math.max(1, i.min * factor - i.qty))])));
  const [vendor, setVendor] = useState(''), [note, setNote] = useState('เติมสต็อกสินค้าต่ำกว่าจุดสั่งซื้อ');
  const { run, pending, error } = useAction();
  const sorted = [...items].sort((a, b) => Number(b.qty <= b.min) - Number(a.qty <= a.min));
  const total = sorted.reduce((a, i) => a + (parseInt(lines[i.sku] ?? '', 10) || 0) * i.price, 0);
  return (
    <Dialog title="สร้างใบขอซื้อ (Purchase Request)" className="w800" onClose={onClose}>
      <div className="dialog-body" style={{ textAlign: 'justify' }}>ระบุจำนวนที่ต้องการสั่ง รายการที่ต่ำกว่าจุดสั่งซื้อเติมจำนวนแนะนำไว้แล้ว ใบขอซื้อจะส่งให้ Manager อนุมัติก่อนออกใบสั่งซื้อ</div>
      <div className="grid2">
        <div className="field"><label htmlFor="pr-v">ผู้ขาย (Vendor)</label><input id="pr-v" className="input" value={vendor} onChange={e => setVendor(e.target.value)} maxLength={200} placeholder="เช่น บจก. ไอทีซัพพลาย" /></div>
        <div className="field"><label htmlFor="pr-n">เหตุผล / หมายเหตุ</label><input id="pr-n" className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></div>
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>สินค้า</th><th className="r">คงเหลือ / จุดสั่งซื้อ</th><th className="r">ราคา</th><th style={{ width: 110 }}>จำนวนสั่ง</th><th className="r">รวม</th></tr></thead>
          <tbody>
            {sorted.map(i => {
              const n = parseInt(lines[i.sku] ?? '', 10) || 0;
              return (
                <tr key={i.sku}>
                  <td>{i.name}
                    {i.qty <= i.min && <span className="tag tag-outline" style={{ marginLeft: 6, padding: '1px 6px' }}>ต่ำ</span>}
                    {i.inPR && <span className="tag tag-neutral" style={{ marginLeft: 6, padding: '1px 6px' }}>มีใบขอซื้อค้าง</span>}
                  </td>
                  <td className="r tnum">{i.qty} / {i.min}</td>
                  <td className="r tnum">{bahtS(i.price)}</td>
                  <td><input className="input" type="number" min={0} aria-label={`จำนวนสั่ง ${i.name}`} style={{ minHeight: 30, padding: '3px 8px' }} value={lines[i.sku] ?? ''} onChange={e => setLines(l => ({ ...l, [i.sku]: e.target.value }))} /></td>
                  <td className="r tnum">{n ? baht(n * i.price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="num" style={{ textAlign: 'right', fontSize: 20 }}>ยอดก่อน VAT {baht(total)}</div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => createPR(vendor, note, lines), onClose)}>ส่งขออนุมัติ</button>
      </div>
    </Dialog>
  );
}

const COMPANY = { name: 'Apex Corporation Co., Ltd.', addr: '199 ถนนพระราม 9 ห้วยขวาง กรุงเทพฯ 10310 · เลขประจำตัวผู้เสียภาษี 0105560000000' };

/** Purchase order sheet. Printing forces the light theme so the PDF is always on white paper. */
export function PODialog({ po, onClose }: { po: PRView; onClose: () => void }) {
  const print = () => {
    const el = document.documentElement, t = el.getAttribute('data-theme');
    el.setAttribute('data-theme', 'light'); window.print(); el.setAttribute('data-theme', t ?? 'light');
  };
  const poNo = 'PO' + po.id.slice(2);
  return (
    <Dialog bare onClose={onClose}>
      <div className="po-wrap">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" style={{ background: 'var(--color-bg)' }} onClick={onClose}>ปิด</button>
          <button className="btn btn-primary" style={{ background: 'var(--color-bg)' }} onClick={print}><PrinterIcon /> พิมพ์ / บันทึกเป็น PDF</button>
        </div>
        <div id="po-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, borderBottom: '1px solid var(--color-text)', paddingBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 500, lineHeight: 1 }}>{COMPANY.name}</div>
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--color-neutral-800)' }}>{COMPANY.addr}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 500, lineHeight: 1 }}>ใบสั่งซื้อ</div>
              <div className="kicker" style={{ marginTop: 4 }}>Purchase Order</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '16px 0', fontSize: 13 }}>
            <div><div className="eyebrow">ผู้ขาย</div><div style={{ fontSize: 15, marginTop: 4 }}>{po.vendor}</div></div>
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px' }}>
              <span className="muted">เลขที่ PO</span><span>{poNo}</span>
              <span className="muted">อ้างอิง PR</span><span>{po.id}</span>
              <span className="muted">วันที่ออก</span><span>{po.decidedText}</span>
              <span className="muted">ผู้ขอซื้อ</span><span>{po.requesterName}</span>
            </div>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th style={{ width: 40 }}>#</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">ราคา/หน่วย</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody>
              {po.lineRows.map(l => (
                <tr key={l.no}><td className="tnum">{l.no}</td><td>{l.name}<div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>{l.sku}</div></td><td className="r tnum">{l.qty} {l.unit}</td><td className="r tnum">{l.priceText}</td><td className="r tnum">{l.amountText}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'auto 130px', gap: '6px 20px', fontSize: 13, textAlign: 'right' }}>
              <span>รวมเป็นเงิน</span><span>{po.totalText}</span>
              <span>ภาษีมูลค่าเพิ่ม 7%</span><span>{po.vatText}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, borderTop: '1px solid var(--color-text)', paddingTop: 6 }}>รวมทั้งสิ้น</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, borderTop: '1px solid var(--color-text)', paddingTop: 6 }}>{po.grandText}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 56, fontSize: 12, textAlign: 'center' }}>
            <div><div style={{ borderTop: '1px solid var(--color-text)', paddingTop: 6 }}>{po.requesterName}</div><div className="muted">ผู้ขอซื้อ</div></div>
            <div><div style={{ borderTop: '1px solid var(--color-text)', paddingTop: 6 }}>{po.finalApprover}</div><div className="muted">{po.approverSub} · {po.decidedText}</div></div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
