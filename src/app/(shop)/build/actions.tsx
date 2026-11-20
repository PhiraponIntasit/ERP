'use client';
import { useState } from 'react';
import Link from 'next/link';
import { addBuildToCart, saveBuild } from '@/server/actions/pc-builder';
import type { Selection } from '@/server/pc-builder';
import { useAction } from '@/components/use-action';
import css from '../storefront.module.css';

export function BuildActions({ sel, canAdd, signedIn, loginHref }: { sel: Selection; canAdd: boolean; signedIn: boolean; loginHref: string }) {
  const add = useAction({ errorAs: 'toast' });
  const save = useAction({ errorAs: 'toast' });
  const [name, setName] = useState('');
  const empty = Object.keys(sel).length === 0;
  return (
    <div className={css.sumActions}>
      <button className="btn btn-primary" disabled={!canAdd || add.pending} onClick={() => add.run(() => addBuildToCart(sel))}>ใส่ตะกร้าทั้งชุด</button>
      {signedIn ? (
        <div className={css.saveRow}>
          <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="ชื่อสเปค เช่น คอมเล่นเกม" aria-label="ชื่อสเปค" />
          <button className="btn btn-secondary" disabled={empty || save.pending} onClick={() => save.run(() => saveBuild(sel, name), () => setName(''))}>บันทึก</button>
        </div>
      ) : !empty && <Link href={loginHref} className="btn btn-secondary">เข้าสู่ระบบเพื่อบันทึกสเปค</Link>}
      {signedIn && <Link href="/account/builds" style={{ fontSize: 14, textAlign: 'center' }}>สเปคที่บันทึกไว้</Link>}
    </div>
  );
}
