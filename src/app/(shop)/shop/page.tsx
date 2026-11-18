import Link from 'next/link';
import type { Metadata } from 'next';
import { listProducts, readShopFilter, SORTS, type ShopFilter, type SortKey } from '@/server/storefront';
import { Pager } from '@/components/pager';
import { ProductGrid } from '../product-card';
import css from '../storefront.module.css';

export const metadata: Metadata = { title: 'สินค้าทั้งหมด · COREPICK' };

type SP = { q?: string; cat?: string; brand?: string; sort?: string; stock?: string; page?: string };

/** Query string for the listing with some filters changed; the page number always resets. */
function qs(f: ShopFilter, change: Partial<Record<'q' | 'cat' | 'brand' | 'sort' | 'stock', string>>) {
  const cur = { q: f.q, cat: f.cat, brand: f.brand, sort: f.sort === 'new' ? '' : f.sort, stock: f.inStock ? '1' : '' };
  const next = { ...cur, ...change };
  const p = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
  return p.size ? `/shop?${p}` : '/shop';
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = readShopFilter(sp);
  const { rows, page, categories, brands } = await listProducts(f, sp.page);
  const catName = categories.find(c => c.slug === f.cat)?.name;
  const brandName = brands.find(b => b.slug === f.brand)?.name;
  const title = f.q ? `ผลการค้นหา “${f.q}”` : catName ?? 'สินค้าทั้งหมด';
  const keep = Object.fromEntries(Object.entries({ q: f.q, cat: f.cat, brand: f.brand, sort: f.sort === 'new' ? '' : f.sort, stock: f.inStock ? '1' : '' }).filter(([, v]) => v));

  return (
    <div className={`${css.list} anim-page`}>
      <aside className={css.side} aria-label="ตัวกรองสินค้า">
        <div>
          <h2>หมวดสินค้า</h2>
          <nav className={css.facet} aria-label="หมวดสินค้า">
            <Link href={qs(f, { cat: '' })} aria-current={!f.cat}>ทุกหมวด</Link>
            {categories.map(c => <Link key={c.slug} href={qs(f, { cat: c.slug })} aria-current={f.cat === c.slug}>{c.name}<span className="tnum">{c.count}</span></Link>)}
          </nav>
        </div>
        <div>
          <h2>ยี่ห้อ</h2>
          <nav className={css.facet} aria-label="ยี่ห้อ">
            <Link href={qs(f, { brand: '' })} aria-current={!f.brand}>ทุกยี่ห้อ</Link>
            {brands.map(b => <Link key={b.slug} href={qs(f, { brand: b.slug })} aria-current={f.brand === b.slug}>{b.name}<span className="tnum">{b.count}</span></Link>)}
          </nav>
        </div>
      </aside>

      <section aria-labelledby="list-h">
        <div className={css.listHead}>
          <h1 id="list-h">{title}</h1>
          <span className="muted tnum" style={{ fontSize: 13 }}>{page.total} รายการ{brandName ? ` · ${brandName}` : ''}</span>
          <div className={css.chips} role="group" aria-label="เรียงลำดับ" style={{ marginLeft: 'auto' }}>
            {(Object.keys(SORTS) as SortKey[]).map(k => (
              <Link key={k} href={qs(f, { sort: k === 'new' ? '' : k })} className={`chip sm${f.sort === k ? ' on' : ''}`} aria-current={f.sort === k}>{SORTS[k]}</Link>
            ))}
            <Link href={qs(f, { stock: f.inStock ? '' : '1' })} className={`chip sm${f.inStock ? ' on' : ''}`} aria-pressed={f.inStock}>มีสินค้าเท่านั้น</Link>
          </div>
        </div>
        {rows.length
          ? <ProductGrid items={rows} />
          : <div className="empty">ไม่พบสินค้าที่ตรงกับเงื่อนไข — <Link href="/shop">ดูสินค้าทั้งหมด</Link></div>}
        <div style={{ marginTop: 16 }}><Pager p={page} keep={keep} /></div>
      </section>
    </div>
  );
}
