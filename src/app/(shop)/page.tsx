import Link from 'next/link';
import type { Metadata } from 'next';
import { homeData } from '@/server/storefront';
import { FREE_SHIPPING_MIN } from '@/lib/shipping';
import { ProductGrid } from './product-card';
import css from './storefront.module.css';

export const metadata: Metadata = { title: 'COREPICK · ร้านอุปกรณ์คอมพิวเตอร์' };

export default async function HomePage() {
  const { categories, newest, deals } = await homeData();
  return (
    <div className="anim-page">
      <section className={css.hero} aria-labelledby="hero-h">
        <div>
          <h1 id="hero-h">อุปกรณ์คอมพิวเตอร์ของแท้ เลือกง่าย ส่งไว</h1>
          <p>ซีพียู การ์ดจอ แรม SSD และอุปกรณ์ต่อพ่วง พร้อมสเปคครบทุกชิ้น ดูจำนวนคงเหลือได้ทันที ชำระด้วย PromptPay QR</p>
          <div className={css.heroCta}>
            <Link href="/shop" className="btn btn-primary">เลือกซื้อสินค้า</Link>
            {categories[0] && <Link href={`/shop?cat=${categories[0].slug}`} className="btn btn-secondary">ดู{categories[0].name}</Link>}
          </div>
        </div>
        <ul className={css.perks}>
          <li><span><strong>ส่งฟรีกรุงเทพฯ และปริมณฑล</strong>ซื้อครบ ฿{FREE_SHIPPING_MIN.toLocaleString('en-US')} ส่งฟรีทั่วประเทศ</span></li>
          <li><span><strong>รับประกันทุกชิ้น</strong>นับจากวันจัดส่ง ตรวจสอบด้วยหมายเลข Serial</span></li>
          <li><span><strong>จ่ายง่ายด้วย PromptPay</strong>สแกน QR ยอดตรงตามคำสั่งซื้อ</span></li>
        </ul>
      </section>

      <div className={css.secHead}><h2>หมวดสินค้า</h2><Link href="/shop">ดูทั้งหมด</Link></div>
      <nav className={css.cats} aria-label="หมวดสินค้า">
        {categories.map(c => <Link key={c.slug} href={`/shop?cat=${c.slug}`} className={css.cat}>{c.name}<span className="tnum">{c.count} รายการ</span></Link>)}
      </nav>

      {deals.length > 0 && <>
        <div className={css.secHead}><h2>ราคาพิเศษ</h2></div>
        <ProductGrid items={deals} />
      </>}

      <div className={css.secHead}><h2>สินค้ามาใหม่</h2><Link href="/shop?sort=new">ดูทั้งหมด</Link></div>
      {newest.length ? <ProductGrid items={newest} /> : <div className="empty">ยังไม่มีสินค้าขึ้นหน้าร้าน</div>}
    </div>
  );
}
