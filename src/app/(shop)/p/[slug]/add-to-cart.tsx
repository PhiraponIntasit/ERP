'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/server/actions/cart';
import { useAction } from '@/components/use-action';
import css from '../../storefront.module.css';

export function AddToCart({ sku, max }: { sku: string; max: number }) {
  const [qty, setQty] = useState(1);
  const router = useRouter();
  const { run, pending } = useAction({ errorAs: 'toast' });
  if (max <= 0) return <button className="btn btn-secondary" disabled>สินค้าหมด</button>;
  const top = Math.min(max, 20);
  const set = (n: number) => setQty(Math.max(1, Math.min(top, n || 1)));
  return (
    <div className={css.addRow}>
      <div className={css.stepper} role="group" aria-label="จำนวน">
        <button type="button" className="btn btn-secondary" onClick={() => set(qty - 1)} disabled={qty <= 1} aria-label="ลดจำนวน">−</button>
        <input className="input tnum" type="number" inputMode="numeric" min={1} max={top} value={qty} onChange={e => set(Number(e.target.value))} aria-label="จำนวนที่สั่ง" />
        <button type="button" className="btn btn-secondary" onClick={() => set(qty + 1)} disabled={qty >= top} aria-label="เพิ่มจำนวน">+</button>
      </div>
      <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => addToCart(sku, qty))}>ใส่ตะกร้า</button>
      <button className="btn btn-primary" disabled={pending} onClick={() => run(() => addToCart(sku, qty), () => router.push('/cart'))}>ซื้อเลย</button>
    </div>
  );
}
