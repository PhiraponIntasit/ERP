'use client';
import { useState } from 'react';
import type { PRView } from '@/server/views';
import { receivePR } from '@/server/actions/stock';
import { useAction } from '@/components/use-action';
import { PODialog, PRDialog, type InvItem } from '@/components/procurement';

export function PurchaseView({ prs, items, factor }: { prs: PRView[]; items: InvItem[]; factor: number }) {
  const [dlg, setDlg] = useState<null | { type: 'pr' } | { type: 'po'; id: string }>(null);
  const { run, pending } = useAction({ errorAs: 'toast' });
  const po = dlg?.type === 'po' ? prs.find(p => p.id === dlg.id) : undefined;
  return (
    <div className="anim-page stack-4">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="lead" style={{ flex: 1, minWidth: 300 }}>ขั้นตอน: สร้างใบขอซื้อ → Manager อนุมัติ → ออกใบสั่งซื้อ (PO) เป็น PDF ส่งผู้ขาย → เมื่อของมาถึง กด “รับเข้าคลัง” เพื่อเพิ่มสต็อก</p>
        <button className="btn btn-primary" onClick={() => setDlg({ type: 'pr' })}>+ สร้างใบขอซื้อ</button>
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th>ผู้ขาย</th><th className="r">มูลค่า (รวม VAT)</th><th>สถานะ</th><th className="r">ดำเนินการ</th></tr></thead>
          <tbody>
            {prs.map(p => (
              <tr key={p.id}>
                <td className="tnum nw">{p.id}</td>
                <td className="tnum nw" style={{ fontSize: 13 }}>{p.dateText}</td>
                <td style={{ fontSize: 13 }}>{p.itemsSummary}</td>
                <td style={{ fontSize: 13 }}>{p.vendor}</td>
                <td className="r tnum">{p.grandText}</td>
                <td><span className={`tag ${p.statusTag}`}>{p.statusLabel}</span>{p.isRejected && <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 4 }}>เหตุผล: {p.reason}</div>}</td>
                <td className="r">
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {p.canPO && <button className="btn btn-secondary" onClick={() => setDlg({ type: 'po', id: p.id })}>ใบสั่งซื้อ PDF</button>}
                    {p.isApproved && <button className="btn btn-primary" disabled={pending} onClick={() => run(() => receivePR(p.id))}>รับเข้าคลัง</button>}
                    {p.isPending && <span style={{ fontSize: 12, color: 'var(--color-neutral-700)', whiteSpace: 'nowrap' }}>{p.waitText}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg?.type === 'pr' && <PRDialog items={items} factor={factor} onClose={() => setDlg(null)} />}
      {po && <PODialog po={po} onClose={() => setDlg(null)} />}
    </div>
  );
}
