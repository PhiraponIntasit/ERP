'use client';
import { useState } from 'react';
import type { PRView } from '@/server/views';
import { receivePR } from '@/server/actions/stock';
import { useAction } from '@/components/use-action';
import { PODialog, PRDialog, ReceivePRDialog, type InvItem, type SupplierOption } from '@/components/procurement';
import { Pager } from '@/components/pager';
import type { Page } from '@/lib/paging';

export function PurchaseView({ toReceive, prs, page, items, suppliers, factor }: { toReceive: PRView[]; prs: PRView[]; page: Page; items: InvItem[]; suppliers: SupplierOption[]; factor: number }) {
  const [dlg, setDlg] = useState<null | { type: 'pr' } | { type: 'po'; id: string } | { type: 'receive'; id: string }>(null);
  const tracked = items.filter(i => i.serialTracked).map(i => i.sku);
  const { run, pending } = useAction({ errorAs: 'toast' });
  const po = dlg?.type === 'po' || dlg?.type === 'receive' ? [...toReceive, ...prs].find(p => p.id === dlg.id) : undefined;
  const table = (rows: PRView[], label: string) => (
    <div className="scroll-x">
      <table className="table" aria-label={label}>
        <thead><tr><th>เลขที่</th><th>วันที่</th><th>รายการ</th><th>ผู้ขาย</th><th className="r">มูลค่า (รวม VAT)</th><th>สถานะ</th><th className="r">ดำเนินการ</th></tr></thead>
        <tbody>
          {rows.map(p => (
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
                  {p.isApproved && <button className="btn btn-primary" disabled={pending} onClick={() => p.lineRows.some(l => tracked.includes(l.sku)) ? setDlg({ type: 'receive', id: p.id }) : run(() => receivePR(p.id))}>รับเข้าคลัง</button>}
                  {p.isPending && <span style={{ fontSize: 12, color: 'var(--color-neutral-700)', whiteSpace: 'nowrap' }}>{p.waitText}</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="anim-page stack-4">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="lead" style={{ flex: 1, minWidth: 300 }}>ขั้นตอน: สร้างใบขอซื้อ → Manager อนุมัติ → ออกใบสั่งซื้อ (PO) เป็น PDF ส่งผู้ขาย → เมื่อของมาถึง กด “รับเข้าคลัง” เพื่อเพิ่มสต็อก</p>
        <a className="btn btn-secondary" href="/purchase/suppliers">ผู้ขาย</a>
        <button className="btn btn-primary" onClick={() => setDlg({ type: 'pr' })}>+ สร้างใบขอซื้อ</button>
      </div>
      {toReceive.length > 0 && <>
        <h3 className="section-h">อนุมัติแล้ว รอรับเข้าคลัง ({toReceive.length})</h3>
        {table(toReceive, 'ใบขอซื้อรอรับเข้าคลัง')}
        <h3 className="section-h" style={{ marginTop: 'var(--space-4)' }}>ใบขอซื้ออื่น ๆ</h3>
      </>}
      {table(prs, 'ใบขอซื้อ')}
      {!prs.length && <div className="empty">{toReceive.length ? 'ไม่มีใบขอซื้ออื่น' : 'ยังไม่มีใบขอซื้อ'}</div>}
      <Pager p={page} />
      {dlg?.type === 'pr' && <PRDialog items={items} suppliers={suppliers} factor={factor} onClose={() => setDlg(null)} />}
      {po && dlg?.type === 'po' && <PODialog po={po} onClose={() => setDlg(null)} />}
      {po && dlg?.type === 'receive' && <ReceivePRDialog po={po} tracked={tracked} onClose={() => setDlg(null)} />}
    </div>
  );
}
