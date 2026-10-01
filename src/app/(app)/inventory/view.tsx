'use client';
import { useState } from 'react';
import { AddItemDialog, PRDialog, ReceiveDialog, type InvItem } from '@/components/procurement';
import { AlertIcon } from '@/components/icons';
import { bahtS } from '@/lib/domain';

type Move = { id: string; tText: string; name: string; type: string; qty: number; ref: string; by: string };

export function InventoryView({ items, moves, manage, factor }: { items: InvItem[]; moves: Move[]; manage: boolean; factor: number }) {
  const [q, setQ] = useState('');
  const [dlg, setDlg] = useState<null | { type: 'receive'; sku?: string } | { type: 'add' } | { type: 'pr' }>(null);
  const lowNoPR = items.filter(i => i.qty <= i.min && !i.inPR);
  const stockVal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const s = q.trim().toLowerCase();
  const rows = items.filter(i => !s || (i.sku + i.name + i.cat).toLowerCase().includes(s));
  const close = () => setDlg(null);

  return (
    <div className="anim-page stack-4">
      {lowNoPR.length > 0 && (
        <div className="alert-box" role="alert">
          <AlertIcon />
          <div style={{ flex: 1 }}>
            <div className="alert-title">สินค้า {lowNoPR.length} รายการ ต่ำกว่าจุดสั่งซื้อและยังไม่มีใบขอซื้อ</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{lowNoPR.map(i => `${i.name} (เหลือ ${i.qty}/${i.min})`).join(' · ')}</div>
          </div>
          {manage && <button className="btn btn-primary" onClick={() => setDlg({ type: 'pr' })}>สร้างใบขอซื้อ</button>}
        </div>
      )}
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 340 }} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อสินค้า, SKU, หมวด" aria-label="ค้นหาสินค้า" />
        <span style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{items.length} รายการ · มูลค่ารวม {bahtS(stockVal)}</span>
        {manage && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={() => setDlg({ type: 'add' })}>+ สินค้าใหม่</button>
            <button className="btn btn-primary" onClick={() => setDlg({ type: 'receive' })}>รับสินค้าเข้า / เพิ่มสต็อก</button>
          </div>
        )}
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>SKU</th><th>สินค้า</th><th>หมวด</th><th>ที่เก็บ</th><th style={{ width: 200 }}>คงเหลือ</th><th className="r">จุดสั่งซื้อ</th><th className="r">ราคา/หน่วย</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map(i => {
              const low = i.qty <= i.min, out = i.qty === 0;
              return (
                <tr key={i.sku}>
                  <td className="tnum" style={{ fontSize: 12 }}>{i.sku}</td>
                  <td>{i.name}</td>
                  <td style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{i.cat}</td>
                  <td style={{ fontSize: 13 }}>{i.loc}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="tnum" style={{ width: 56, color: low ? 'var(--color-accent-800)' : 'var(--color-text)' }}>{i.qty} {i.unit}</span>
                      <div className="qbar"><div style={{ width: Math.min(100, i.qty / Math.max(1, i.min * factor) * 100) + '%', background: low ? 'var(--color-accent-700)' : 'var(--color-neutral-600)' }} /></div>
                    </div>
                  </td>
                  <td className="r tnum">{i.min}</td>
                  <td className="r tnum">{bahtS(i.price)}</td>
                  <td><span className={`tag ${low ? (i.inPR ? 'tag-accent' : 'tag-outline') : 'tag-neutral'}`}>{out ? 'หมดสต็อก' : low ? (i.inPR ? 'ต่ำ · สั่งแล้ว' : 'ต่ำกว่าจุดสั่งซื้อ') : 'ปกติ'}</span></td>
                  <td className="r">{manage && <button className="btn btn-ghost" onClick={() => setDlg({ type: 'receive', sku: i.sku })}>+ เพิ่ม</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        <h3 className="section-h">ประวัติการเคลื่อนไหวสต็อก</h3>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>วันเวลา</th><th>ประเภท</th><th>สินค้า</th><th className="r">จำนวน</th><th>อ้างอิง</th><th>ผู้ทำรายการ</th></tr></thead>
            <tbody>
              {moves.map(m => (
                <tr key={m.id}>
                  <td className="tnum" style={{ fontSize: 13 }}>{m.tText}</td>
                  <td><span className={`tag ${m.type === 'in' ? 'tag-accent' : 'tag-neutral'}`}>{m.type === 'in' ? 'รับเข้า' : 'เบิกออก'}</span></td>
                  <td>{m.name}</td>
                  <td className="r tnum">{(m.type === 'in' ? '+' : '−') + m.qty}</td>
                  <td style={{ fontSize: 13 }}>{m.ref}</td>
                  <td style={{ fontSize: 13 }}>{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {dlg?.type === 'receive' && <ReceiveDialog items={items} sku={dlg.sku} onClose={close} />}
      {dlg?.type === 'add' && <AddItemDialog onClose={close} />}
      {dlg?.type === 'pr' && <PRDialog items={items} factor={factor} onClose={close} />}
    </div>
  );
}
