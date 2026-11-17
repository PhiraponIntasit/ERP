'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CatalogOptions, ProductFilter, ProductRow } from '@/server/products';
import { Pager } from '@/components/pager';
import type { Page } from '@/lib/paging';
import { bahtS } from '@/lib/domain';
import css from './products.module.css';

const STATUS: [ProductFilter['status'], string][] = [['all', 'ทั้งหมด'], ['active', 'ขายอยู่'], ['hidden', 'ยังไม่ขึ้นหน้าร้าน']];

export function ProductsView({ rows, page, counts, filter, options }: {
  rows: ProductRow[]; page: Page; counts: Record<ProductFilter['status'], number>; filter: ProductFilter; options: CatalogOptions;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filter.q);
  const params = (over: Partial<ProductFilter>) => {
    const f = { ...filter, ...over }, out: Record<string, string> = {};
    if (f.q) out.q = f.q;
    if (f.cat) out.cat = f.cat;
    if (f.brand) out.brand = f.brand;
    if (f.status !== 'all') out.status = f.status;
    return out;
  };
  const go = (over: Partial<ProductFilter>) => { const p = new URLSearchParams(params(over)); router.push(p.size ? `?${p}` : '?', { scroll: false }); };

  return (
    <div className="anim-page stack-4">
      <div className="toolbar">
        <form className={css.filters} style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); go({ q: q.trim() }); }}>
          <input className={`input ${css.search}`} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อสินค้าหรือ SKU แล้วกด Enter" aria-label="ค้นหาสินค้า" />
          <select className="input" value={filter.cat} onChange={e => go({ cat: e.target.value })} aria-label="กรองตามหมวด">
            <option value="">ทุกหมวด</option>
            {options.categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
            <option value="none">ยังไม่ระบุหมวด</option>
          </select>
          <select className="input" value={filter.brand} onChange={e => go({ brand: e.target.value })} aria-label="กรองตามยี่ห้อ">
            <option value="">ทุกยี่ห้อ</option>
            {options.brands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.count})</option>)}
          </select>
        </form>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <Link href="/products/catalog" className="btn btn-secondary" style={{ textDecoration: 'none' }}>หมวด & ยี่ห้อ</Link>
          <Link href="/products/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>+ สินค้าใหม่</Link>
        </div>
      </div>
      <div role="group" aria-label="กรองตามสถานะ" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS.map(([k, label]) => (
          <button key={k} className={`chip sm${filter.status === k ? ' on' : ''}`} aria-pressed={filter.status === k} onClick={() => go({ status: k })}>
            {label} <span className="tnum">({counts[k]})</span>
          </button>
        ))}
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>สินค้า</th><th>หมวด · ยี่ห้อ</th><th className="r">ราคาทุน</th><th className="r">ราคาขาย</th><th className="r">พร้อมขาย</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => {
              const margin = r.price > 0 ? (r.price - r.cost) / r.price * 100 : 0, free = r.qty - r.reserved;
              return (
                <tr key={r.sku}>
                  <td>
                    <div className={css.prod}>
                      {r.thumb ? <img className={css.thumb} src={r.thumb} alt="" /> : <span className={css.thumb}>ไม่มีรูป</span>}
                      <div><div className={css.prodName}>{r.name}</div><div className={`${css.sku} tnum`}>{r.sku}</div></div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{r.category}<div className={css.sku}>{r.brand}</div></td>
                  <td className="r tnum">{bahtS(r.cost)}</td>
                  <td className="r tnum">{bahtS(r.price)}<div className={css.margin}>{r.price > 0 ? `กำไร ${margin.toFixed(0)}%` : 'ยังไม่ตั้งราคา'}</div></td>
                  <td className="r tnum">{free} {r.unit}{r.reserved > 0 && <div className={css.margin}>จอง {r.reserved}</div>}</td>
                  <td><span className={`tag ${r.active ? 'tag-accent' : 'tag-neutral'}`}>{r.active ? 'ขายอยู่' : 'ซ่อน'}</span></td>
                  <td className="r"><Link href={`/products/${encodeURIComponent(r.sku)}`} className="btn btn-ghost" style={{ textDecoration: 'none' }}>แก้ไข</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">ไม่พบสินค้าตามเงื่อนไขนี้</div>}
      <Pager p={page} keep={params({})} />
    </div>
  );
}
