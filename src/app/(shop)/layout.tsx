import Link from 'next/link';
import css from './shop.module.css';

// Minimal storefront frame for checkout and payment; person A's storefront layout replaces it.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={css.top}><Link href="/" className={css.brand}>COREPICK</Link><span className="muted" style={{ fontSize: 13 }}>ร้านอุปกรณ์คอมพิวเตอร์</span></header>
      <main className={css.main}>{children}</main>
    </>
  );
}
