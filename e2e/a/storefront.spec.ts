import { test, expect } from '@playwright/test';
import { db } from '../helpers';

// Storefront catalogue: home, listing (search, category/brand filters, sort, in-stock) and the product page.
// Uses its own products (SKU E2E-SF-…) and deletes them afterwards.
const n = Date.now().toString(36).toUpperCase();
const SKU = { deal: `E2E-SF-${n}-D`, out: `E2E-SF-${n}-O`, hidden: `E2E-SF-${n}-H` };
const slug = (s: string) => s.toLowerCase();

test.beforeAll(async () => {
  const cpu = await db.category.findUniqueOrThrow({ where: { slug: 'cpu' } });
  const amd = await db.brand.findUniqueOrThrow({ where: { slug: 'amd' } });
  const base = { cat: 'ทดสอบ', unit: 'ชิ้น', min: 0, loc: 'E2E', cost: 100, categoryId: cpu.id, brandId: amd.id };
  await db.inventoryItem.createMany({ data: [
    { ...base, sku: SKU.deal, slug: slug(SKU.deal), name: `E2E Storefront Deal ${n}`, qty: 2, price: 900, compareAt: 1200, active: true,
      specs: { socket: 'AM5', cores: 6, tdpW: 65 }, description: 'ทดสอบหน้าสินค้า\nบรรทัดที่สอง', warrantyMonths: 24 },
    { ...base, sku: SKU.out, slug: slug(SKU.out), name: `E2E Storefront Soldout ${n}`, qty: 0, price: 500, active: true },
    { ...base, sku: SKU.hidden, slug: slug(SKU.hidden), name: `E2E Storefront Hidden ${n}`, qty: 5, price: 500, active: false },
  ] });
});
test.afterAll(async () => { await db.inventoryItem.deleteMany({ where: { sku: { startsWith: 'E2E-SF-' } } }); });

test('home lists categories and products, and links into the catalogue', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cats = page.getByRole('navigation', { name: 'หมวดสินค้า' });
  await expect(cats.getByRole('link', { name: /ซีพียู/ })).toBeVisible();
  await cats.getByRole('link', { name: /ซีพียู/ }).click();
  await expect(page).toHaveURL(/\/shop\?cat=cpu$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ซีพียู (CPU)');
});

test('search matches every word; hidden products never show', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).fill('ryzen 7600');
  await page.getByRole('button', { name: 'ค้นหา' }).click();
  await expect(page).toHaveURL(/\/shop\?q=ryzen\+7600/);
  await expect(page.locator('[data-sku="CPU-R5-7600"]')).toBeVisible();
  await expect(page.locator('[data-sku="CPU-R7-7800X3D"]')).toHaveCount(0);   // "ryzen" alone would match it

  await page.goto(`/shop?q=${n}`);
  await expect(page.locator(`[data-sku="${SKU.deal}"]`)).toBeVisible();
  await expect(page.locator(`[data-sku="${SKU.hidden}"]`)).toHaveCount(0);
  expect((await page.goto(`/p/${slug(SKU.hidden)}`))!.status()).toBe(404);
});

test('category + brand filters, price sort and the in-stock filter', async ({ page }) => {
  await page.goto('/shop?cat=cpu&sort=price-asc');
  const prices = await page.locator('[data-sku]').evaluateAll(cards => cards.map(c => Number(c.querySelector('.tnum')!.textContent!.replace(/[^\d.]/g, ''))));
  expect(prices.length).toBeGreaterThan(2);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));

  await page.getByRole('navigation', { name: 'ยี่ห้อ' }).getByRole('link', { name: /^AMD/ }).click();
  await expect(page).toHaveURL(/cat=cpu/);
  await expect(page).toHaveURL(/brand=amd/);
  await expect(page.locator('[data-sku="CPU-I5-14400F"]')).toHaveCount(0);

  await page.goto(`/shop?q=${n}`);
  const out = page.locator(`[data-sku="${SKU.out}"]`);
  await expect(out).toContainText('สินค้าหมด');
  await page.getByRole('link', { name: 'มีสินค้าเท่านั้น' }).click();
  await expect(page).toHaveURL(/stock=1/);
  await expect(out).toHaveCount(0);
  await expect(page.locator(`[data-sku="${SKU.deal}"]`)).toBeVisible();
});

test('product page: price with discount, low stock, warranty and specs', async ({ page }) => {
  await page.goto(`/shop?q=${n}`);
  await page.locator(`[data-sku="${SKU.deal}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug(SKU.deal)}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`E2E Storefront Deal ${n}`);
  await expect(page.locator('main')).toContainText('฿900.00');
  await expect(page.locator('main')).toContainText('ลด ฿300.00');
  await expect(page.locator('main')).toContainText('เหลือ 2 ชิ้น');
  await expect(page.locator('main')).toContainText('24 เดือน');
  const specs = page.getByRole('table');
  await expect(specs.getByRole('row', { name: /Socket/ })).toContainText('AM5');
  await expect(specs.getByRole('row', { name: /TDP/ })).toContainText('65 W');
  await expect(page.getByRole('navigation', { name: 'ตำแหน่งหน้า' })).toContainText('ซีพียู (CPU)');
  expect((await page.goto('/p/no-such-product'))!.status()).toBe(404);
});
