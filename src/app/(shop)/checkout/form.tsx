'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { placeOrder, previewCoupon } from '@/server/actions/checkout';
import { PROVINCES, shippingFee, shippingNote } from '@/lib/shipping';
import { baht } from '@/lib/domain';
import type { CheckoutLine } from '@/server/orders';
import { Err } from '@/components/dialog';
import css from '../shop.module.css';

type Addr = Record<'name' | 'phone' | 'line1' | 'subdistrict' | 'district' | 'province' | 'postcode', string>;

export function CheckoutForm({ lines, init, hasAddress, minutes }: { lines: CheckoutLine[]; init: Addr; hasAddress: boolean; minutes: number }) {
  const [f, setF] = useState<Addr>(init), [save, setSave] = useState(false);
  const [error, setError] = useState(''), [pending, start] = useTransition();
  const [code, setCode] = useState(''), [coupon, setCoupon] = useState<{ code: string; discount: number; text: string } | null>(null);
  const [couponErr, setCouponErr] = useState(''), [checking, startCheck] = useTransition();
  const applyCoupon = () => {
    setCouponErr('');
    startCheck(async () => {
      const r = await previewCoupon(code).catch(() => ({ ok: false as const, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }));
      if (r.ok) setCoupon({ code: r.code, discount: r.discount, text: r.text }); else { setCoupon(null); setCouponErr(r.error); }
    });
  };
  const router = useRouter();
  // Shown for convenience only — the server recomputes every amount from the database
  const subtotal = Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;
  const discount = coupon?.discount ?? 0, goods = Math.round((subtotal - discount) * 100) / 100;
  const fee = f.province ? shippingFee(f.province, goods) : null;
  const short = lines.filter(l => l.qty > l.available || !l.active);
  const inp = (k: keyof Addr, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`field${k === 'line1' ? ' full' : ''}`}><label htmlFor={'co-' + k}>{label}</label>
      <input id={'co-' + k} className="input" value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} {...extra} /></div>
  );
  const submit = () => {
    setError('');
    start(async () => {
      const r = await placeOrder({ ...f, save: String(save), coupon: coupon?.code ?? '' }).catch(() => ({ ok: false as const, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }));
      if (r.ok && r.msg) router.push(`/pay/${r.msg}`);
      else if (!r.ok) setError(r.error);
    });
  };
  return (
    <div className="stack-4">
      <h1 className="section-h">ชำระเงิน</h1>
      <div className={css.cols}>
        <section className="card stack-4" aria-label="ที่อยู่จัดส่ง">
          <h2 className="section-h" style={{ fontSize: 18 }}>ที่อยู่จัดส่ง</h2>
          <div className="grid2">
            {inp('name', 'ชื่อผู้รับ', { maxLength: 100, autoComplete: 'name' })}
            {inp('phone', 'เบอร์โทร', { type: 'tel', maxLength: 12, autoComplete: 'tel', placeholder: '0812345678' })}
            {inp('line1', 'บ้านเลขที่ ถนน ซอย', { maxLength: 200, autoComplete: 'address-line1' })}
            {inp('subdistrict', 'ตำบล / แขวง', { maxLength: 80 })}
            {inp('district', 'อำเภอ / เขต', { maxLength: 80 })}
            <div className="field"><label htmlFor="co-province">จังหวัด</label>
              <select id="co-province" className="input" value={f.province} onChange={e => setF(x => ({ ...x, province: e.target.value }))}>
                <option value="">— เลือกจังหวัด —</option>
                {PROVINCES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            {inp('postcode', 'รหัสไปรษณีย์', { inputMode: 'numeric', maxLength: 5, autoComplete: 'postal-code' })}
          </div>
          {hasAddress && <label style={{ fontSize: 14, display: 'flex', gap: 8 }}><input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} /> บันทึกเป็นที่อยู่ใหม่ในบัญชี</label>}
        </section>
        <aside className={`card stack-4 ${css.sum}`} aria-label="สรุปคำสั่งซื้อ">
          <h2 className="section-h" style={{ fontSize: 18 }}>สรุปคำสั่งซื้อ</h2>
          <div>
            {lines.map(l => (
              <div key={l.sku} className={css.line}><span>{l.name} × {l.qty}{(l.qty > l.available || !l.active) && <span className="err"> · {l.active ? `เหลือ ${Math.max(0, l.available)}` : 'หยุดขาย'}</span>}</span><span className="tnum">{baht(l.price * l.qty)}</span></div>
            ))}
            <div className={css.line}><span>ยอดสินค้า</span><span className="tnum">{baht(subtotal)}</span></div>
            {coupon && <div className={css.line}><span>ส่วนลดคูปอง {coupon.code}</span><span className="tnum" data-testid="discount">−{baht(discount)}</span></div>}
            <div className={css.line}><span>ค่าจัดส่ง</span><span className="tnum" data-testid="ship-fee">{fee === null ? '—' : fee ? baht(fee) : 'ฟรี'}</span></div>
            {f.province && <div className={css.note}>{shippingNote(f.province, goods)}</div>}
            <div className={css.total}><span>รวมชำระ</span><span className="tnum" data-testid="grand">{baht(goods + (fee ?? 0))}</span></div>
            <div className={css.note}>ราคารวม VAT 7% แล้ว</div>
          </div>
          <div className="stack-4" style={{ gap: 6 }}>
            {coupon
              ? <div className={css.line}><span className="tag tag-accent">{coupon.code} · {coupon.text}</span><button className="btn btn-ghost" onClick={() => { setCoupon(null); setCode(''); }}>เอาออก</button></div>
              : <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="โค้ดส่วนลด" aria-label="โค้ดส่วนลด" maxLength={20} autoCapitalize="characters" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') applyCoupon(); }} />
                  <button className="btn btn-secondary" disabled={checking || !code.trim()} onClick={applyCoupon}>ใช้คูปอง</button>
                </div>}
            <Err msg={couponErr} />
          </div>
          <Err msg={error} />
          <button className="btn btn-primary" disabled={pending || !!short.length} onClick={submit}>{pending ? 'กำลังสั่งซื้อ…' : 'สั่งซื้อและชำระด้วย PromptPay'}</button>
          <div className={css.note}>กดสั่งซื้อแล้ว ร้านจะกันสินค้าไว้ให้ {minutes} นาทีระหว่างรอชำระเงิน</div>
        </aside>
      </div>
    </div>
  );
}
