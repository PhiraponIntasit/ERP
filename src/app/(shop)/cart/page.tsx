import Link from 'next/link';
import type { Metadata } from 'next';
import { cartView } from '@/server/cart';
import { getCustomer } from '@/server/customer-session';
import { baht } from '@/lib/domain';
import { FREE_SHIPPING_MIN } from '@/lib/shipping';
import { CartLine } from './lines';
import css from '../storefront.module.css';

export const metadata: Metadata = { title: 'ตะกร้าสินค้า · COREPICK' };

export default async function CartPage() {
  const [cart, me] = await Promise.all([cartView(), getCustomer()]);
  if (!cart.lines.length) {
    return (
      <div className="anim-page stack-4" style={{ alignItems: 'flex-start' }}>
        <h1 className="section-h">ตะกร้าสินค้า</h1>
        <p className="lead">ตะกร้ายังว่างอยู่</p>
        <Link href="/shop" className="btn btn-primary">เลือกซื้อสินค้า</Link>
      </div>
    );
  }
  const checkout = me ? '/checkout' : '/account/login?next=/checkout';
  return (
    <div className="anim-page">
      <div className={css.listHead}><h1>ตะกร้าสินค้า</h1><span className="muted tnum" style={{ fontSize: 13 }}>{cart.count} ชิ้น</span></div>
      <div className={css.cartCols}>
        <ul className={css.cartList} aria-label="สินค้าในตะกร้า">{cart.lines.map(l => <CartLine key={l.sku} l={l} />)}</ul>
        <aside className={`card ${css.cartSum}`} aria-label="สรุปยอด">
          <div className={css.sumRow}><span>ยอดสินค้า</span><span className="tnum">{baht(cart.subtotal)}</span></div>
          <div className={css.sumRow}><span>ค่าจัดส่ง</span><span className="muted">คำนวณตอนชำระเงิน</span></div>
          <p className={css.shipHint}>
            {cart.toFreeShipping > 0
              ? <>ซื้อเพิ่มอีก <strong className="tnum">{baht(cart.toFreeShipping)}</strong> ส่งฟรีทั่วประเทศ · กรุงเทพฯ และปริมณฑลส่งฟรีอยู่แล้ว</>
              : <>ยอดครบ ฿{FREE_SHIPPING_MIN.toLocaleString('en-US')} — ส่งฟรีทั่วประเทศ</>}
          </p>
          <div className={css.sumTotal}><span>รวม</span><span className="tnum">{baht(cart.subtotal)}</span></div>
          <span className={css.vat}>ราคารวม VAT 7% แล้ว · ใส่คูปองได้ในขั้นตอนชำระเงิน</span>
          {cart.ok
            ? <Link href={checkout} className="btn btn-primary btn-block">{me ? 'สั่งซื้อและชำระเงิน' : 'เข้าสู่ระบบเพื่อสั่งซื้อ'}</Link>
            : <><button className="btn btn-primary btn-block" disabled>สั่งซื้อและชำระเงิน</button>
                <span className={css.stockOut} role="status">แก้รายการที่มีปัญหาก่อนสั่งซื้อ</span></>}
          {!me && <span className={css.vat}>ยังไม่มีบัญชี? <Link href="/account/register?next=/checkout">สมัครสมาชิก</Link> — สินค้าในตะกร้าจะย้ายไปบัญชีให้</span>}
          <Link href="/shop" className="btn btn-ghost" style={{ alignSelf: 'center' }}>เลือกซื้อต่อ</Link>
        </aside>
      </div>
    </div>
  );
}
