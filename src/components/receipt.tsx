'use client';
import type { Receipt } from '@/server/order-views';
import { Dialog } from './dialog';
import { PrinterIcon } from './icons';

/** Receipt / abbreviated tax invoice for a paid order — print or save as PDF from the browser. */
export function ReceiptDialog({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const print = () => {
    const el = document.documentElement, t = el.getAttribute('data-theme');
    el.setAttribute('data-theme', 'light'); window.print(); el.setAttribute('data-theme', t ?? 'light');
  };
  const h = { fontFamily: 'var(--font-heading)', fontWeight: 700, lineHeight: 1.1 } as const;
  return (
    <Dialog bare onClose={onClose}>
      <div className="po-wrap">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
          <button className="btn btn-primary" onClick={print}><PrinterIcon /> พิมพ์ / บันทึกเป็น PDF</button>
        </div>
        <div className="print-sheet" id="receipt-print" aria-label={`ใบเสร็จ ${r.no}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, borderBottom: '1px solid var(--color-text)', paddingBottom: 16 }}>
            <div>
              <div style={{ ...h, fontSize: 28, letterSpacing: '.06em' }}>{r.shop.brand}</div>
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--color-neutral-800)' }}>{r.shop.name} · {r.shop.addr}</div>
              <div className="tnum" style={{ fontSize: 12, color: 'var(--color-neutral-800)' }}>เลขประจำตัวผู้เสียภาษี {r.shop.taxId} · โทร {r.shop.phone}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...h, fontSize: 24 }}>ใบเสร็จรับเงิน</div>
              <div className="kicker" style={{ marginTop: 4 }}>ใบกำกับภาษีอย่างย่อ · Receipt</div>
            </div>
          </div>
          {r.refunded && <div className="err" style={{ marginTop: 10, fontSize: 14 }}>คำสั่งซื้อนี้ยกเลิกและคืนเงินแล้ว</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '16px 0', fontSize: 13 }}>
            <div><div className="eyebrow">ลูกค้า</div><div style={{ fontSize: 15, marginTop: 4 }}>{r.customer}</div>
              <div style={{ marginTop: 2 }}>จัดส่ง: {r.shipName} · {r.shipAddress}</div></div>
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px' }}>
              <span className="muted">เลขที่</span><span>{r.no}</span>
              <span className="muted">คำสั่งซื้อ</span><span>{r.orderId}</span>
              <span className="muted">วันที่ชำระ</span><span>{r.paidText}</span>
              <span className="muted">ชำระโดย</span><span>PromptPay</span>
            </div>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th style={{ width: 40 }}>#</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">ราคา/หน่วย</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody>{r.lines.map(l => <tr key={l.no}><td className="tnum">{l.no}</td><td>{l.name}<div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>{l.sku}</div></td><td className="r tnum">{l.qty}</td><td className="r tnum">{l.priceText}</td><td className="r tnum">{l.amountText}</td></tr>)}</tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'auto 130px', gap: '6px 20px', fontSize: 13, textAlign: 'right' }}>
              <span>ยอดสินค้า</span><span>{r.subtotalText}</span>
              {r.discountText && <><span>ส่วนลด</span><span>−{r.discountText}</span></>}
              <span>ค่าจัดส่ง</span><span>{r.shippingText}</span>
              <span className="muted">มูลค่าก่อนภาษี</span><span className="muted">{r.netText}</span>
              <span className="muted">ภาษีมูลค่าเพิ่ม 7%</span><span className="muted">{r.vatText}</span>
              <span style={{ ...h, fontSize: 18, borderTop: '1px solid var(--color-text)', paddingTop: 6 }}>รวมทั้งสิ้น</span>
              <span style={{ ...h, fontSize: 18, borderTop: '1px solid var(--color-text)', paddingTop: 6 }} data-testid="receipt-total">{r.totalText}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 32 }}>ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว · เอกสารออกโดยระบบ (ข้อมูลร้านในโปรเจกต์นี้เป็นข้อมูลสมมติ)</div>
        </div>
      </div>
    </Dialog>
  );
}
