import Link from 'next/link';
import { Logo } from '@/components/logo';
import { SHOP } from '@/lib/shop';
import { FREE_SHIPPING_MIN, UPCOUNTRY_FEE } from '@/lib/shipping';
import css from './storefront.module.css';

// Storefront frame: header with search, the page, and a footer with the shop's details and policies.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={css.shop}>
      <header className={css.head}>
        <div className={css.headIn}>
          <Link href="/" className={css.logo} aria-label="COREPICK หน้าแรก"><Logo height={34} tagline={false} /></Link>
          <form action="/shop" className={css.search} role="search">
            <input name="q" type="search" className="input" placeholder="ค้นหาสินค้า เช่น Ryzen, RTX 4060, SSD 1TB" aria-label="ค้นหาสินค้า" enterKeyHint="search" />
            <button className="btn btn-primary">ค้นหา</button>
          </form>
          <nav className={css.nav} aria-label="เมนูร้าน">
            <Link href="/shop" className={css.navLink}>สินค้าทั้งหมด</Link>
          </nav>
        </div>
      </header>
      <main className={css.main}>{children}</main>
      <footer className={css.foot}>
        <div className={css.footIn}>
          <div><h2>{SHOP.brand}</h2><p>{SHOP.name}<br />{SHOP.addr}<br />โทร {SHOP.phone}</p></div>
          <div><h2>การจัดส่ง</h2><p>กรุงเทพฯ และปริมณฑลส่งฟรี · ต่างจังหวัด ฿{UPCOUNTRY_FEE}<br />ซื้อครบ ฿{FREE_SHIPPING_MIN.toLocaleString('en-US')} ส่งฟรีทั่วประเทศ</p></div>
          <div><h2>การชำระเงินและประกัน</h2><p>ชำระผ่าน PromptPay QR · ราคารวม VAT 7%<br />สินค้ารับประกันตามระยะที่ระบุ นับจากวันจัดส่ง</p></div>
        </div>
      </footer>
    </div>
  );
}
