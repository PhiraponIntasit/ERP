'use client';
import { useState } from 'react';
import Link from 'next/link';
import { saveSupplier, setSupplierActive } from '@/server/actions/stock';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';

type Row = { id: string; name: string; taxId: string; phone: string; email: string; active: boolean; prs: number };

export function SuppliersView({ rows }: { rows: Row[] }) {
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <div className="anim-page stack-4">
      <div className="toolbar">
        <p className="lead" style={{ margin: 0 }}>ผู้ขายที่ร้านสั่งซื้อสินค้าเข้า ใบขอซื้อเลือกได้เฉพาะผู้ขายที่เปิดใช้ ชื่อและเลขผู้เสียภาษีจะพิมพ์บนใบสั่งซื้อ (PO)</p>
        <div className="ml-auto" style={{ display: 'flex', gap: 8 }}>
          <Link href="/purchase" className="btn btn-secondary" style={{ textDecoration: 'none' }}>← ใบขอซื้อ</Link>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>+ เพิ่มผู้ขาย</button>
        </div>
      </div>
      <div className="scroll-x">
        <table className="table" aria-label="ผู้ขาย">
          <thead><tr><th>ชื่อผู้ขาย</th><th>เลขผู้เสียภาษี</th><th>ติดต่อ</th><th className="r">ใบขอซื้อ</th><th>สถานะ</th><th className="r">ดำเนินการ</th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} style={s.active ? undefined : { opacity: 0.6 }}>
                <td>{s.name}</td>
                <td className="tnum nw">{s.taxId || '—'}</td>
                <td style={{ fontSize: 13 }}>{[s.phone, s.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className="r tnum">{s.prs}</td>
                <td><span className={`tag ${s.active ? 'tag-accent' : 'tag-neutral'}`}>{s.active ? 'ใช้งาน' : 'หยุดใช้'}</span></td>
                <td className="r">
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setEdit(s)} aria-label={`แก้ไข ${s.name}`}>แก้ไข</button>
                    <button className="btn btn-ghost" disabled={pending} onClick={() => run(() => setSupplierActive(s.id, !s.active))} aria-label={`${s.active ? 'หยุดใช้' : 'เปิดใช้'} ${s.name}`}>{s.active ? 'หยุดใช้' : 'เปิดใช้'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">ยังไม่มีผู้ขาย</div>}
      {edit && <SupplierDialog row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SupplierDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: row?.name ?? '', taxId: row?.taxId ?? '', phone: row?.phone ?? '', email: row?.email ?? '' });
  const { run, pending, error } = useAction();
  const inp = (k: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`field${k === 'name' ? ' full' : ''}`}><label htmlFor={'sp-' + k}>{label}</label><input id={'sp-' + k} className="input" value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} {...extra} /></div>
  );
  return (
    <Dialog title={row ? `แก้ไขผู้ขาย · ${row.name}` : 'เพิ่มผู้ขาย'} className="w560" onClose={onClose}>
      <div className="grid2">
        {inp('name', 'ชื่อผู้ขาย', { maxLength: 200, placeholder: 'เช่น บจก. ตัวอย่างไอที' })}
        {inp('taxId', 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', { inputMode: 'numeric', maxLength: 17 })}
        {inp('phone', 'โทรศัพท์', { type: 'tel', maxLength: 30 })}
        {inp('email', 'อีเมล', { type: 'email', maxLength: 120 })}
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSupplier(row?.id ?? null, f), onClose)}>บันทึก</button>
      </div>
    </Dialog>
  );
}
