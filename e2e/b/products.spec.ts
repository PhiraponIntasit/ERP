import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// Back-office product management (/products): create, edit with an audited diff, specs per category,
// photos, listing on the storefront, categories & brands, and who may open it.

const stamp = () => Date.now().toString(36).toUpperCase();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function newProduct(page: Page, sku: string, name: string) {
  await page.goto('/products/new');
  await page.fill('#p-sku', sku);
  await page.fill('#p-name', name);
  await page.selectOption('#p-cat', { label: 'ซีพียู (CPU)' });
  await page.selectOption('#p-brand', { label: 'AMD' });
  await page.fill('#p-price', '5990');
  await page.fill('#p-cost', '5200');
  await page.selectOption('#spec-socket', 'AM5');
  await page.fill('#spec-tdpW', '65');
  await page.getByRole('button', { name: 'เพิ่มสินค้า' }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${sku}$`));
}

test.describe('products', () => {
  const created: string[] = [];
  test.afterAll(async () => { await db.inventoryItem.deleteMany({ where: { sku: { in: created } } }); });

  test('create a product with specs, then list it on the storefront', async ({ page }) => {
    const sku = `E2E-${stamp()}`, name = `E2E Ryzen ${sku}`;
    created.push(sku);
    await loginAs(page, USERS.storekeeper);
    await newProduct(page, sku, name);

    const p = await db.inventoryItem.findUniqueOrThrow({ where: { sku } });
    expect(p.active).toBe(false); // new products start hidden
    expect([Number(p.price), Number(p.cost)]).toEqual([5990, 5200]);
    expect(p.specs).toEqual({ socket: 'AM5', tdpW: 65 });
    expect(p.slug).toBe(`e2e-ryzen-${sku.toLowerCase()}`);

    await page.getByRole('button', { name: 'เปิดขาย' }).click();
    await expect(page.getByRole('button', { name: 'ซ่อนจากหน้าร้าน' })).toBeVisible();
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku } })).active).toBe(true);
    expect(await db.auditLog.count({ where: { cat: 'product', target: sku, action: 'เปิดขายบนหน้าร้าน' } })).toBe(1);

    await page.goto(`/products?q=${sku}&status=active`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(name);
  });

  test('price edits are validated and written to the Audit Log as before → after', async ({ page }) => {
    const sku = `E2E-${stamp()}`;
    created.push(sku);
    await loginAs(page, USERS.storekeeper);
    await newProduct(page, sku, `E2E price ${sku}`);

    await page.fill('#p-compareAt', '5000'); // below the selling price
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.locator('.err')).toContainText('ราคาก่อนลดต้องสูงกว่าราคาขาย');

    await page.fill('#p-compareAt', '6490');
    await page.fill('#p-price', '5790');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect.poll(async () => Number((await db.inventoryItem.findUniqueOrThrow({ where: { sku } })).price)).toBe(5790);
    const log = await db.auditLog.findFirstOrThrow({ where: { cat: 'product', target: sku, action: 'แก้ไขสินค้า' } });
    expect(log.detail).toContain('ราคาขาย ฿5,990.00 → ฿5,790.00');
    expect(log.detail).toContain('ราคาก่อนลด — → ฿6,490.00');
  });

  test('a listed product cannot lose what the storefront needs', async ({ page }) => {
    await loginAs(page, USERS.storekeeper);
    await page.goto('/products/CPU-R5-7600');
    await page.selectOption('#p-brand', { label: '— เลือกยี่ห้อ —' });
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.locator('.err')).toContainText('สินค้านี้ขายอยู่ — เลือกยี่ห้อก่อนเปิดขาย');
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku: 'CPU-R5-7600' } })).brandId).not.toBeNull();
  });

  test('photos: upload, public image URL, reorder and delete', async ({ page, request }) => {
    const sku = `E2E-${stamp()}`;
    created.push(sku);
    await loginAs(page, USERS.storekeeper);
    await newProduct(page, sku, `E2E photo ${sku}`);

    await page.setInputFiles('input[aria-label="เพิ่มรูปสินค้า"]', [
      { name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(page.locator('img[alt^="รูปที่"]')).toHaveCount(2);
    const imgs = await db.productImage.findMany({ where: { sku }, orderBy: { ord: 'asc' } });
    expect(imgs).toHaveLength(2);

    // Anyone can load a product photo — the storefront is public
    const res = await request.get(`/api/products/images/${imgs[0].id}`, { headers: { cookie: '' } });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^image\//);

    await page.getByRole('button', { name: 'เลื่อนรูปที่ 2 ไปก่อน' }).click();
    await expect.poll(async () => (await db.productImage.findFirstOrThrow({ where: { sku }, orderBy: { ord: 'asc' } })).id).toBe(imgs[1].id);

    await page.getByRole('button', { name: 'ลบรูปที่ 1' }).click();
    await expect(page.locator('img[alt^="รูปที่"]')).toHaveCount(1);
    expect(await db.productImage.count({ where: { sku } })).toBe(1);
  });
});

test('categories and brands: add, protect spec slugs, delete only when empty', async ({ page }) => {
  const name = `E2E หมวด ${stamp()}`;
  await loginAs(page, USERS.storekeeper);
  await page.goto('/products/catalog');
  await page.getByLabel('ชื่อหมวดสินค้าใหม่').fill(name);
  await page.getByLabel('slug หมวดสินค้าใหม่').fill('e2e-cat');
  await page.getByRole('button', { name: 'เพิ่ม' }).first().click();
  await expect(page.getByLabel(`ชื่อ ${name}`)).toBeVisible();

  // A category whose slug keys spec fields keeps its slug
  await expect(page.getByLabel('slug ซีพียู (CPU)')).toHaveAttribute('readonly', '');
  // Used ones can't be deleted; the empty new one can
  await expect(page.getByRole('button', { name: 'ลบ ซีพียู (CPU)' })).toBeDisabled();
  await page.getByRole('button', { name: `ลบ ${name}` }).click();
  await expect(page.getByLabel(`ชื่อ ${name}`)).toHaveCount(0);
  expect(await db.category.count({ where: { slug: 'e2e-cat' } })).toBe(0);
});

for (const [user, allowed] of [[USERS.storekeeper, true], [USERS.admin, true], [USERS.itsupport, false], [USERS.employee, false]] as const) {
  test(`${user} ${allowed ? 'can' : 'cannot'} open product management`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto('/products');
    if (allowed) await expect(page).toHaveURL(/\/products$/);
    else await expect(page).not.toHaveURL(/\/products/);
  });
}
