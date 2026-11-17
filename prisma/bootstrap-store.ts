// Prepares a REAL database for the store, without any sample data — the counterpart of bootstrap.ts.
// Adds the standard product categories and brands, the order-number counter, and files the products the
// shop already has under a category by their old free-text group. Never deletes or overwrites anything,
// so it is safe to run again (each run reports what it added).
//   npm run db:bootstrap:store            (DATABASE_URL = the production database)
// It does NOT add suppliers, customers, coupons or orders: suppliers are real companies with real tax IDs —
// enter them in ใบขอซื้อ → ผู้ขาย. Sample data for demos comes from `npm run db:seed` on a separate database.
import { PrismaClient } from '@prisma/client';
import { BRANDS, CATEGORIES, slugOf } from './seed-store';

const db = new PrismaClient();

/** Old free-text groups (InventoryItem.cat) → category slug. Unknown groups are left for staff to file. */
const OLD_GROUPS: Record<string, string> = {
  'ซีพียู': 'cpu', 'cpu': 'cpu', 'เมนบอร์ด': 'mainboard', 'การ์ดจอ': 'vga',
  'หน่วยความจำ': 'ram', 'แรม': 'ram', 'ram': 'ram',
  'storage': 'ssd', 'ssd': 'ssd', 'ฮาร์ดดิสก์': 'ssd',
  'พาวเวอร์ซัพพลาย': 'psu', 'เคส': 'case', 'ชุดระบายความร้อน': 'cooler',
  'จอภาพ': 'monitor', 'อุปกรณ์ต่อพ่วง': 'peripheral', 'สายเชื่อมต่อ': 'cable', 'สายและอะแดปเตอร์': 'cable',
  'อุปกรณ์ไฟฟ้า': 'notebook-parts', 'แบตเตอรี่': 'notebook-parts', 'อะไหล่โน้ตบุ๊ก': 'notebook-parts',
  'วัสดุสิ้นเปลือง': 'consumable',
};

async function main() {
  const before = { cats: await db.category.count(), brands: await db.brand.count() };
  // Match on slug (categories) / name (brands) so entries staff already created or renamed are left alone
  const haveSlugs = new Set((await db.category.findMany({ select: { slug: true } })).map(c => c.slug));
  await db.category.createMany({ data: CATEGORIES.filter(([slug]) => !haveSlugs.has(slug)).map(([slug, name], sort) => ({ id: 'cat-' + slug, slug, name, sort })), skipDuplicates: true });
  const haveBrands = new Set((await db.brand.findMany({ select: { name: true, slug: true } })).flatMap(b => [b.name.toLowerCase(), b.slug]));
  await db.brand.createMany({ data: BRANDS.filter(n => !haveBrands.has(n.toLowerCase()) && !haveBrands.has(slugOf(n))).map(name => ({ id: 'brand-' + slugOf(name), slug: slugOf(name), name })), skipDuplicates: true });
  await db.counter.createMany({ data: [{ key: 'ord', value: 1 }], skipDuplicates: true });

  const bySlug = new Map((await db.category.findMany({ select: { id: true, slug: true } })).map(c => [c.slug, c.id]));
  let filed = 0;
  const unfiled = new Map<string, number>();
  for (const it of await db.inventoryItem.findMany({ where: { categoryId: null }, select: { sku: true, cat: true } })) {
    const slug = OLD_GROUPS[it.cat.trim().toLowerCase()] ?? OLD_GROUPS[it.cat.trim()];
    const id = slug && bySlug.get(slug);
    if (id) { await db.inventoryItem.update({ where: { sku: it.sku }, data: { categoryId: id } }); filed++; }
    else unfiled.set(it.cat, (unfiled.get(it.cat) ?? 0) + 1);
  }
  const [cats, brands, hidden, suppliers] = await Promise.all([db.category.count(), db.brand.count(), db.inventoryItem.count({ where: { active: false } }), db.supplier.count({ where: { active: true } })]);
  console.log(`หมวดสินค้า ${cats} (เพิ่ม ${cats - before.cats}) · ยี่ห้อ ${brands} (เพิ่ม ${brands - before.brands}) · จัดสินค้าเดิมเข้าหมวด ${filed} รายการ`);
  if (unfiled.size) console.log(`ยังไม่มีหมวด: ${[...unfiled].map(([g, n]) => `${g} (${n})`).join(', ')} — เลือกหมวดเองในหน้าสินค้า`);
  console.log(`ต่อไป: ตั้งราคาขาย/ยี่ห้อ แล้วกด "เปิดขาย" ที่หน้าสินค้า (ยังซ่อนอยู่ ${hidden} รายการ)` + (suppliers ? '' : ' · เพิ่มผู้ขายจริงที่ ใบขอซื้อ → ผู้ขาย ก่อนสร้างใบขอซื้อ'));
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); }).finally(() => db.$disconnect());
