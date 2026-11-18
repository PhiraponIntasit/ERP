import 'server-only';
import type { Prisma } from '@prisma/client';
import { db, num } from './db';
import { available } from './stock-reserve';
import { imageUrl } from './products';
import { pageOf } from '@/lib/paging';
import { specFieldsFor, specText, type Specs } from '@/lib/specs';

// Storefront catalogue: only products marked `active` are ever shown. Prices come from the database
// (VAT included) and "in stock" is qty − reserved, the same number checkout uses.

export const SHOP_PAGE_SIZE = 24;
export const SORTS = { new: 'มาใหม่', 'price-asc': 'ราคาต่ำ → สูง', 'price-desc': 'ราคาสูง → ต่ำ' } as const;
export type SortKey = keyof typeof SORTS;
export type ShopFilter = { q: string; cat: string; brand: string; sort: SortKey; inStock: boolean };

const clean = (s: string | undefined, max = 60) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function readShopFilter(sp: { q?: string; cat?: string; brand?: string; sort?: string; stock?: string }): ShopFilter {
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : 'new') as SortKey;
  return { q: clean(sp.q), cat: clean(sp.cat, 40), brand: clean(sp.brand, 40), sort, inStock: sp.stock === '1' };
}

const cardInclude = { brand: true, category: true, images: { orderBy: { ord: 'asc' }, take: 1 } } satisfies Prisma.InventoryItemInclude;
type CardRow = Prisma.InventoryItemGetPayload<{ include: typeof cardInclude }>;

function cardOf(i: CardRow) {
  return {
    sku: i.sku, slug: i.slug ?? i.sku.toLowerCase(), name: i.name,
    brand: i.brand?.name ?? '', category: i.category?.name ?? i.cat, categorySlug: i.category?.slug ?? '',
    price: num(i.price), compareAt: i.compareAt == null ? null : num(i.compareAt),
    available: Math.max(0, available(i)), image: i.images[0] ? imageUrl(i.images[0].id) : null,
  };
}
export type ProductCard = ReturnType<typeof cardOf>;

function searchWhere(q: string): Prisma.InventoryItemWhereInput {
  if (!q) return {};
  const words = q.split(' ').filter(Boolean).slice(0, 5);
  // every word must match the name, SKU or brand ("ryzen 7600" finds "AMD Ryzen 5 7600")
  return { AND: words.map(w => ({ OR: [
    { name: { contains: w, mode: 'insensitive' } }, { sku: { contains: w, mode: 'insensitive' } },
    { brand: { name: { contains: w, mode: 'insensitive' } } },
  ] })) };
}

const ORDER: Record<SortKey, Prisma.InventoryItemOrderByWithRelationInput[]> = {
  new: [{ createdAt: 'desc' }, { sku: 'asc' }], 'price-asc': [{ price: 'asc' }, { sku: 'asc' }], 'price-desc': [{ price: 'desc' }, { sku: 'asc' }],
};

export async function listProducts(f: ShopFilter, rawPage: string | undefined) {
  const base: Prisma.InventoryItemWhereInput = { active: true, ...searchWhere(f.q) };
  const byCat: Prisma.InventoryItemWhereInput = f.cat ? { category: { slug: f.cat } } : {};
  const byBrand: Prisma.InventoryItemWhereInput = f.brand ? { brand: { slug: f.brand } } : {};
  // "in stock" compares two columns, which Prisma can't express in a where — filter the matching SKUs first
  let stockSkus: string[] | null = null;
  if (f.inStock) {
    const rows = await db.inventoryItem.findMany({ where: { AND: [base, byCat, byBrand] }, select: { sku: true, qty: true, reserved: true } });
    stockSkus = rows.filter(r => available(r) > 0).map(r => r.sku);
  }
  const where: Prisma.InventoryItemWhereInput = { AND: [base, byCat, byBrand, stockSkus ? { sku: { in: stockSkus } } : {}] };
  const [total, cats, brands] = await Promise.all([
    db.inventoryItem.count({ where }),
    db.category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }], select: { slug: true, name: true, _count: { select: { items: { where: { AND: [base, byBrand] } } } } } }),
    db.brand.findMany({ orderBy: { name: 'asc' }, select: { slug: true, name: true, _count: { select: { items: { where: { AND: [base, byCat] } } } } } }),
  ]);
  const page = pageOf(rawPage, total, SHOP_PAGE_SIZE);
  const rows = await db.inventoryItem.findMany({ where, include: cardInclude, orderBy: ORDER[f.sort], skip: page.skip, take: page.size });
  return {
    rows: rows.map(cardOf), page,
    categories: cats.filter(c => c._count.items > 0 || c.slug === f.cat).map(c => ({ slug: c.slug, name: c.name, count: c._count.items })),
    brands: brands.filter(b => b._count.items > 0 || b.slug === f.brand).map(b => ({ slug: b.slug, name: b.name, count: b._count.items })),
  };
}

export async function homeData() {
  const [cats, newest, deals] = await Promise.all([
    db.category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }], select: { slug: true, name: true, _count: { select: { items: { where: { active: true } } } } } }),
    db.inventoryItem.findMany({ where: { active: true }, include: cardInclude, orderBy: ORDER.new, take: 8 }),
    db.inventoryItem.findMany({ where: { active: true, compareAt: { not: null } }, include: cardInclude, orderBy: { price: 'desc' }, take: 8 }),
  ]);
  return {
    categories: cats.filter(c => c._count.items > 0).map(c => ({ slug: c.slug, name: c.name, count: c._count.items })),
    newest: newest.map(cardOf),
    deals: deals.map(cardOf).filter(d => d.compareAt != null && d.compareAt > d.price).slice(0, 4),
  };
}

export async function productBySlug(slug: string) {
  const i = await db.inventoryItem.findFirst({
    where: { active: true, slug: slug.toLowerCase() },
    include: { brand: true, category: true, images: { orderBy: { ord: 'asc' } } },
  });
  if (!i) return null;
  const specs = (i.specs ?? {}) as Specs;
  const related = i.categoryId
    ? await db.inventoryItem.findMany({ where: { active: true, categoryId: i.categoryId, NOT: { sku: i.sku } }, include: cardInclude, orderBy: ORDER.new, take: 4 })
    : [];
  return {
    sku: i.sku, slug: i.slug ?? '', name: i.name, unit: i.unit, description: i.description,
    brand: i.brand ? { slug: i.brand.slug, name: i.brand.name } : null,
    category: i.category ? { slug: i.category.slug, name: i.category.name } : null,
    price: num(i.price), compareAt: i.compareAt == null ? null : num(i.compareAt),
    available: Math.max(0, available(i)), warrantyMonths: i.warrantyMonths, serialTracked: i.serialTracked,
    images: i.images.map(im => ({ id: im.id, src: imageUrl(im.id) })),
    specs: specFieldsFor(i.category?.slug).filter(fl => specs[fl.key] != null && specs[fl.key] !== '').map(fl => ({ label: fl.label, value: specText(fl, specs[fl.key]) })),
    related: related.map(cardOf),
  };
}
export type ProductPage = NonNullable<Awaited<ReturnType<typeof productBySlug>>>;
