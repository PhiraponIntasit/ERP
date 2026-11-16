'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMyOrder, simulatePayment } from '@/server/actions/checkout';
import { useAction } from '@/components/use-action';
import { Err } from '@/components/dialog';
import css from '../../shop.module.css';

type Props = {
  id: string; status: string; statusLabel: string; svg: string; totalText: string; expiresAt: string; paidText: string;
  demo: boolean; canSimulate: boolean; lines: { name: string; qty: number; amountText: string }[]; shipText: string; shipTo: string;
};

export function PayScreen(p: Props) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const left = useCountdown(p.expiresAt, p.status === 'pending_payment');

  // Ask the server every 3 s; once the webhook has marked the order paid (or it expired) re-render
  useEffect(() => {
    if (p.status !== 'pending_payment') return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/orders/${encodeURIComponent(p.id)}/status`, { cache: 'no-store' });
        if (r.ok && (await r.json()).status !== 'pending_payment') router.refresh();
      } catch { /* offline for a moment — try again next tick */ }
    }, 3000);
    return () => clearInterval(t);
  }, [p.id, p.status, router]);
  useEffect(() => { if (p.status === 'pending_payment' && left === 0) router.refresh(); }, [left, p.status, router]);

  return (
    <div className={`stack-4 ${css.pay}`}>
      <div className="kicker">คำสั่งซื้อ {p.id}</div>
      {p.status === 'pending_payment' ? <>
        <h1 className="section-h">สแกนจ่ายด้วย PromptPay</h1>
        {p.demo && <div className={css.demo} role="note">โหมดเดโม — QR นี้ใช้รหัสพร้อมเพย์สมมติ ห้ามโอนเงินจริง</div>}
        {p.svg ? <div className={css.qr} role="img" aria-label={`QR PromptPay ยอด ${p.totalText}`} dangerouslySetInnerHTML={{ __html: p.svg }} /> : <div className="err">สร้าง QR ไม่สำเร็จ กรุณาติดต่อร้าน</div>}
        <div className={`${css.amount} tnum`} data-testid="pay-amount">{p.totalText}</div>
        <div>ชำระภายใน <span className={`${css.clock} tnum`} data-testid="countdown">{fmt(left)}</span> นาที</div>
        <p className="lead" style={{ textAlign: 'center' }}>เปิดแอปธนาคาร เลือกสแกน QR ยอดเงินจะขึ้นให้อัตโนมัติ หน้านี้จะเปลี่ยนเองเมื่อร้านได้รับเงิน</p>
        <Err msg={error} />
        <div className={css.row}>
          {p.demo && p.canSimulate && <button className="btn btn-primary" disabled={pending} onClick={() => run(() => simulatePayment(p.id))}>จำลองการโอนเงิน (เดโม)</button>}
          <button className="btn btn-secondary" disabled={pending} onClick={() => confirm('ยกเลิกคำสั่งซื้อนี้?') && run(() => cancelMyOrder(p.id))}>ยกเลิกคำสั่งซื้อ</button>
        </div>
      </> : p.status === 'expired' || p.status === 'cancelled' ? <>
        <h1 className="section-h">{p.statusLabel}</h1>
        <p className="lead" style={{ textAlign: 'center' }}>คำสั่งซื้อนี้ไม่ได้ชำระเงิน ร้านคืนสินค้าที่กันไว้กลับเข้าสต็อกแล้ว สั่งใหม่ได้จากตะกร้า</p>
      </> : <>
        <div className={css.done} aria-hidden>✓</div>
        <h1 className="section-h">ชำระเงินสำเร็จ</h1>
        <p className="lead" style={{ textAlign: 'center' }}>ได้รับเงิน {p.totalText} เมื่อ {p.paidText} ร้านส่งใบเสร็จไปที่อีเมลของคุณแล้ว และจะแจ้งเลขพัสดุเมื่อจัดส่ง</p>
        <span className="tag tag-accent" style={{ alignSelf: 'center' }}>{p.statusLabel}</span>
      </>}
      <section className="card" style={{ textAlign: 'left' }} aria-label="รายการสินค้า">
        {p.lines.map((l, i) => <div key={i} className={css.line}><span>{l.name} × {l.qty}</span><span className="tnum">{l.amountText}</span></div>)}
        <div className={css.line}><span>ค่าจัดส่ง</span><span className="tnum">{p.shipText}</span></div>
        <div className={css.total}><span>รวม</span><span className="tnum">{p.totalText}</span></div>
        <div className={css.note} style={{ marginTop: 8 }}>จัดส่งถึง {p.shipTo}</div>
      </section>
    </div>
  );
}

function useCountdown(iso: string, on: boolean) {
  // null until mounted, so the server-rendered HTML and the first client render agree
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const calc = () => Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
    setLeft(calc());
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
  }, [iso, on]);
  return left;
}
const fmt = (s: number | null) => s === null ? '–:––' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
