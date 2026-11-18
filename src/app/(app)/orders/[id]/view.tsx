'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { OrderDetail } from '@/server/order-views';
import { markDelivered, packOrder, refund, refundLate, shipIt } from '@/server/actions/orders';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { ReceiptDialog } from '@/components/receipt';
import { SerialInput, lines as serialLines } from '@/components/serial-input';

export function OrderView({ o, canRefund, carriers }: { o: OrderDetail; canRefund: boolean; carriers: string[] }) {
  const [dlg, setDlg] = useState<null | 'receipt' | 'refund' | 'late'>(null);
  const { run, pending } = useAction({ errorAs: 'toast' });
  const refundable = canRefund && (o.status === 'paid' || o.status === 'packing');
  return (
    <div className="anim-page stack-4">
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href="/orders" className="btn btn-secondary" style={{ textDecoration: 'none' }}>← คำสั่งซื้อ</Link>
        <h2 className="section-h tnum" style={{ margin: 0 }}>{o.id}</h2>
        <span className={`tag ${o.statusTag}`} data-testid="order-status">{o.statusLabel}</span>
        <div className="ml-auto" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {o.receipt && <button className="btn btn-secondary" onClick={() => setDlg('receipt')}>ใบเสร็จ PDF</button>}
          {o.status === 'paid' && <button className="btn btn-primary" disabled={pending} onClick={() => run(() => packOrder(o.id))}>เริ่มแพ็ก</button>}
          {o.status === 'shipped' && <button className="btn btn-primary" disabled={pending} onClick={() => run(() => markDelivered(o.id))}>ส่งถึงแล้ว · ปิดงาน</button>}
          {refundable && <button className="btn btn-ghost" onClick={() => setDlg('refund')}>ยกเลิกและคืนเงิน</button>}
          {o.lateMoney && canRefund && <button className="btn btn-primary" onClick={() => setDlg('late')}>บันทึกการคืนเงิน</button>}
        </div>
      </div>
      {o.lateMoney && <div className="err" role="alert" data-testid="late-money">ลูกค้าโอนเงินเข้ามาหลังคำสั่งซื้อหมดเวลา/ยกเลิก — โอนคืนลูกค้าแล้วบันทึกเลขอ้างอิง{!canRefund && ' (Manager หรือ Admin เป็นผู้บันทึก)'}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <section className="card stack-4" aria-label="ลูกค้า">
          <div className="eyebrow">ลูกค้า</div>
          <div>{o.customer.name}<div className="muted" style={{ fontSize: 13 }}>{o.customer.email} · {o.customer.phone || '—'}</div></div>
          <div className="eyebrow">จัดส่งถึง</div>
          <div style={{ fontSize: 14 }}>{o.shipName} · {o.shipPhone}<div>{o.shipAddress}</div></div>
          {o.trackingNo && <div style={{ fontSize: 14 }}><span className="eyebrow">พัสดุ</span><div className="tnum">{o.carrier} · {o.trackingNo}</div><div className="muted" style={{ fontSize: 12 }}>ส่งเมื่อ {o.shippedText}</div></div>}
        </section>
        <section className="card stack-4" aria-label="การชำระเงิน">
          <div className="eyebrow">การชำระเงิน</div>
          <div className="tnum" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 14 }}>
            <span>ยอดสินค้า</span><span>{o.subtotalText}</span>
            {o.discountText && <><span>ส่วนลด</span><span>−{o.discountText}</span></>}
            <span>ค่าจัดส่ง</span><span>{o.shippingText}</span>
            <strong>รวม</strong><strong>{o.totalText}</strong>
          </div>
          {o.payments.map(p => <div key={p.id} className="muted tnum" style={{ fontSize: 12 }}>PromptPay {p.amountText} · {p.status}{p.paidText && ` · ${p.paidText}`}</div>)}
          {o.refund && <div style={{ fontSize: 13 }}><span className="tag tag-outline">คืนเงินแล้ว</span> {o.refund.at}<div>เหตุผล: {o.refund.reason}</div><div className="tnum">อ้างอิง: {o.refund.ref}</div></div>}
        </section>
      </div>

      <section className="stack-4" aria-label="รายการสินค้า">
        <h3 className="section-h">รายการสินค้า</h3>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>สินค้า</th><th>ที่เก็บ</th><th className="r">จำนวน</th><th className="r">ราคา</th><th className="r">รวม</th></tr></thead>
            <tbody>{o.lines.map(l => (
              <tr key={l.id}>
                <td>{l.name}<div className="muted tnum" style={{ fontSize: 12 }}>{l.sku}{l.serialTracked && ' · เก็บ Serial'}</div>
                  {l.serials.length > 0 && <div className="tnum" style={{ fontSize: 12 }}>Serial: {l.serials.join(', ')}</div>}</td>
                <td className="tnum">{l.loc}</td><td className="r tnum">{l.qty}</td><td className="r tnum">{l.priceText}</td><td className="r tnum">{l.amountText}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </section>

      {o.status === 'packing' && <ShipForm o={o} carriers={carriers} />}

      <section className="stack-4" aria-label="ประวัติคำสั่งซื้อ">
        <h3 className="section-h">ประวัติ</h3>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {o.log.map(a => <li key={a.id} style={{ marginBottom: 6 }}><span className="tnum muted" style={{ fontSize: 12 }}>{a.tText}</span> · {a.action} <span className="muted">โดย {a.by}</span>{a.detail && <div className="muted" style={{ fontSize: 12 }}>{a.detail}</div>}</li>)}
        </ol>
      </section>

      {dlg === 'receipt' && o.receipt && <ReceiptDialog r={o.receipt} onClose={() => setDlg(null)} />}
      {dlg === 'refund' && <RefundDialog o={o} onClose={() => setDlg(null)} />}
      {dlg === 'late' && <RefundDialog o={o} late onClose={() => setDlg(null)} />}
    </div>
  );
}

function ShipForm({ o, carriers }: { o: OrderDetail; carriers: string[] }) {
  const tracked = o.lines.filter(l => l.serialTracked);
  const [carrier, setCarrier] = useState(''), [tracking, setTracking] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const { run, pending, error } = useAction();
  return (
    <section className="card stack-4" aria-label="จัดส่ง">
      <h3 className="section-h" style={{ fontSize: 18 }}>จัดส่ง</h3>
      {tracked.length > 0 && <p className="lead" style={{ fontSize: 14 }}>สแกน Serial ของสินค้าที่หยิบใส่กล่องให้ครบทุกชิ้น ใช้อ้างอิงเมื่อลูกค้าเคลมประกัน</p>}
      {tracked.map(l => <SerialInput key={l.id} id={`sn-${l.sku}`} label={l.name} need={l.qty} value={vals[l.id] ?? ''} onChange={v => setVals(x => ({ ...x, [l.id]: v }))} />)}
      <div className="grid2">
        <div className="field"><label htmlFor="sh-carrier">ขนส่ง</label>
          <select id="sh-carrier" className="input" value={carrier} onChange={e => setCarrier(e.target.value)}>
            <option value="">— เลือกขนส่ง —</option>{carriers.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sh-track">เลขพัสดุ</label>
          <input id="sh-track" className="input tnum" value={tracking} onChange={e => setTracking(e.target.value)} maxLength={30} autoCapitalize="characters" /></div>
      </div>
      <Err msg={error} />
      <div><button className="btn btn-primary" disabled={pending} onClick={() => run(() => shipIt(o.id, carrier, tracking, Object.fromEntries(tracked.map(l => [l.id, serialLines(vals[l.id] ?? '')]))))}>ยืนยันจัดส่ง</button></div>
    </section>
  );
}

function RefundDialog({ o, late = false, onClose }: { o: OrderDetail; late?: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(''), [ref, setRef] = useState('');
  const { run, pending, error } = useAction();
  return (
    <Dialog title={late ? `บันทึกการคืนเงิน · ${o.id}` : `ยกเลิกและคืนเงิน · ${o.id}`} onClose={onClose}>
      <div className="dialog-body">{late ? 'โอนเงินคืนลูกค้าก่อน แล้วบันทึกเลขอ้างอิงการโอน' : `โอนเงินคืนลูกค้า ${o.totalText} แล้วบันทึกที่นี่ สินค้าทุกรายการจะกลับเข้าสต็อก และระบบแจ้งลูกค้าทางอีเมล`}</div>
      {!late && <div className="field"><label htmlFor="rf-reason">เหตุผล (แจ้งลูกค้า)</label><input id="rf-reason" className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} /></div>}
      <div className="field"><label htmlFor="rf-ref">เลขอ้างอิงการโอนคืน</label><input id="rf-ref" className="input tnum" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => (late ? refundLate(o.id, ref) : refund(o.id, reason, ref)), onClose)}>ยืนยันคืนเงิน</button>
      </div>
    </Dialog>
  );
}
