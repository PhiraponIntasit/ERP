'use client';
import Link from 'next/link';
import { setCartQty } from '@/server/actions/cart';
import { useAction } from '@/components/use-action';
import type { CartView } from '@/server/cart';
import { baht } from '@/lib/domain';
import { NoPicture } from '../product-card';
import css from '../storefront.module.css';

type Line = CartView['lines'][number];

export function CartLine({ l }: { l: Line }) {
  const { run, pending } = useAction({ errorAs: 'toast' });
  const set = (n: number) => run(() => setCartQty(l.sku, n));
  const top = Math.min(20, Math.max(l.available, l.qty));
  return (
    <li className={css.cartLine} data-sku={l.sku} aria-busy={pending}>
      <Link href={`/p/${l.slug}`} className={css.cartPic} style={l.image ? { backgroundImage: `url(${l.image})` } : undefined} aria-label={l.name} tabIndex={-1}>
        {!l.image && <NoPicture label="" size={28} />}
      </Link>
      <div className={css.cartInfo}>
        {l.brand && <span className={css.cardBrand}>{l.brand}</span>}
        <Link href={`/p/${l.slug}`} className={css.cartName}>{l.name}</Link>
        <span className="muted tnum" style={{ fontSize: 13 }}>{baht(l.price)} / ชิ้น</span>
        {l.problem && <span className={css.stockOut} role="status">{l.problem}</span>}
      </div>
      <div className={css.stepper} role="group" aria-label={`จำนวน ${l.name}`}>
        <button type="button" className="btn btn-secondary" disabled={pending || l.qty <= 1} onClick={() => set(l.qty - 1)} aria-label="ลดจำนวน">−</button>
        <span className={`${css.qty} tnum`} aria-live="polite">{l.qty}</span>
        <button type="button" className="btn btn-secondary" disabled={pending || l.qty >= top} onClick={() => set(l.qty + 1)} aria-label="เพิ่มจำนวน">+</button>
      </div>
      <span className={`${css.lineTotal} tnum`}>{baht(l.price * l.qty)}</span>
      <button type="button" className={`btn btn-ghost ${css.remove}`} disabled={pending} onClick={() => set(0)} aria-label={`ลบ ${l.name} ออกจากตะกร้า`}>ลบ</button>
    </li>
  );
}
