import { test, expect, type Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { db } from '../helpers';

// Cart: visitors get a cart of their own (cookie token, only its hash stored), quantities are capped by stock,
// it moves into the customer's cart on sign-in, and problem lines block checkout.
// Own products (E2E-CT-…) and customers (@e2e-cart.example), all removed afterwards.
const n = Date.now().toString(36).toUpperCase();
const A = `E2E-CT-${n}-A`, B = `E2E-CT-${n}-B`, OUT = `E2E-CT-${n}-O`;
const DOMAIN = '@e2e-cart.example', PW = 'cart-pass-123';
const started = new Date();

test.beforeAll(async () => {
  const base = { cat: 'ทดสอบ', unit: 'ชิ้น', min: 0, loc: 'E2E', cost: 50, active: true };
  await db.inventoryItem.createMany({ data: [
    { ...base, sku: A, slug: A.toLowerCase(), name: `E2E ตะกร้า A ${n}`, qty: 3, price: 700 },
    { ...base, sku: B, slug: B.toLowerCase(), name: `E2E ตะกร้า B ${n}`, qty: 10, price: 1500 },
    { ...base, sku: OUT, slug: OUT.toLowerCase(), name: `E2E ตะกร้า หมด ${n}`, qty: 0, price: 100 },
  ] });
});
test.afterAll(async () => {
  await db.customer.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await db.inventoryItem.deleteMany({ where: { sku: { startsWith: `E2E-CT-${n}` } } });
  await db.cart.deleteMany({ where: { customerId: null, updatedAt: { gte: started }, items: { none: {} } } });
});

const badge = (page: Page) => page.getByRole('link', { name: /^ตะกร้าสินค้า \d+ ชิ้น$/ });
const toast = (page: Page, text: string | RegExp) => page.locator('.toast', { hasText: text });
async function add(page: Page, sku: string, qty = 1) {
  await page.goto(`/p/${sku.toLowerCase()}`);
  if (qty !== 1) await page.getByLabel('จำนวนที่สั่ง').fill(String(qty));
  await page.getByRole('button', { name: 'ใส่ตะกร้า' }).click();
  await expect(toast(page, 'ลงตะกร้าแล้ว').last()).toBeVisible();
}

test('a visitor fills a cart: stock limits, change quantity, remove', async ({ page }) => {
  await add(page, A);
  await expect(badge(page)).toHaveAccessibleName('ตะกร้าสินค้า 1 ชิ้น');
  await add(page, A, 2);
  await expect(badge(page)).toHaveAccessibleName('ตะกร้าสินค้า 3 ชิ้น');
  await page.getByRole('button', { name: 'ใส่ตะกร้า' }).click();               // only 3 in stock
  await expect(toast(page, 'ในตะกร้ามีแล้ว 3 ชิ้น')).toBeVisible();

  // the cookie is a random token; the table only keeps its hash
  const token = (await page.context().cookies()).find(c => c.name === 'cp_cart')!.value;
  const cart = await db.cart.findUniqueOrThrow({ where: { guestToken: createHash('sha256').update(token).digest('hex') }, include: { items: true } });
  expect(cart.customerId).toBeNull();
  expect(cart.items).toEqual([expect.objectContaining({ sku: A, qty: 3 })]);

  await page.goto(`/p/${OUT.toLowerCase()}`);
  await expect(page.getByRole('button', { name: 'สินค้าหมด' })).toBeDisabled();

  await badge(page).click();
  const line = page.locator(`[data-sku="${A}"]`);
  await expect(line).toContainText('฿2,100.00');
  await expect(line.getByRole('button', { name: 'เพิ่มจำนวน' })).toBeDisabled();
  await line.getByRole('button', { name: 'ลดจำนวน' }).click();
  await expect(line).toContainText('฿1,400.00');
  await expect(page.getByRole('complementary', { name: 'สรุปยอด' })).toContainText('ซื้อเพิ่มอีก ฿600.00 ส่งฟรี');
  await line.getByRole('button', { name: /^ลบ / }).click();
  await expect(page.getByText('ตะกร้ายังว่างอยู่')).toBeVisible();
});

test('signing in moves the visitor cart into the customer cart, then on to checkout', async ({ page }) => {
  const c = await db.customer.create({ data: { email: `merge-${n}${DOMAIN}`.toLowerCase(), name: 'ทดสอบ รวมตะกร้า', passwordHash: await bcrypt.hash(PW, 10) } });
  await db.cart.create({ data: { customerId: c.id, items: { create: [{ sku: A, qty: 2 }, { sku: B, qty: 1 }] } } });

  await add(page, A, 2);                                       // 2 + 2 > 3 in stock → capped at 3
  await page.goto('/cart');
  await page.getByRole('link', { name: 'เข้าสู่ระบบเพื่อสั่งซื้อ' }).click();
  await page.fill('#cl-email', c.email);
  await page.fill('#cl-password', PW);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/:\d+\/checkout$/);

  const mine = await db.cart.findUniqueOrThrow({ where: { customerId: c.id }, include: { items: { orderBy: { sku: 'asc' } } } });
  expect(mine.items.map(i => [i.sku, i.qty])).toEqual([[A, 3], [B, 1]]);
  expect((await page.context().cookies()).find(x => x.name === 'cp_cart')).toBeUndefined();
  await expect(page.locator('main')).toContainText(`E2E ตะกร้า A ${n}`);   // B's checkout reads the merged cart
  await expect(page.locator('main')).toContainText(`E2E ตะกร้า B ${n}`);
});

test('a line that can no longer be sold blocks checkout until it is fixed', async ({ page }) => {
  const c = await db.customer.create({ data: { email: `stock-${n}${DOMAIN}`.toLowerCase(), name: 'ทดสอบ สต็อก', passwordHash: await bcrypt.hash(PW, 10) } });
  await db.cart.create({ data: { customerId: c.id, items: { create: [{ sku: B, qty: 4 }] } } });
  await page.goto('/account/login?next=/cart');
  await page.fill('#cl-email', c.email);
  await page.fill('#cl-password', PW);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/:\d+\/cart$/);
  await expect(page.getByRole('link', { name: 'สั่งซื้อและชำระเงิน' })).toBeVisible();

  await db.inventoryItem.update({ where: { sku: B }, data: { reserved: 8 } });   // someone else is paying for 8 of 10
  await page.reload();
  const line = page.locator(`[data-sku="${B}"]`);
  await expect(line).toContainText('เหลือเพียง 2 ชิ้น');
  await expect(page.getByRole('button', { name: 'สั่งซื้อและชำระเงิน' })).toBeDisabled();
  await line.getByRole('button', { name: 'ลดจำนวน' }).click();                    // 4 → 3: still more than 2
  await expect(toast(page, 'เหลือเพียง 2 ชิ้น')).toBeVisible();
  await db.cartItem.update({ where: { cartId_sku: { cartId: (await db.cart.findUniqueOrThrow({ where: { customerId: c.id } })).id, sku: B } }, data: { qty: 2 } });
  await page.reload();
  await expect(page.getByRole('link', { name: 'สั่งซื้อและชำระเงิน' })).toBeVisible();
  await db.inventoryItem.update({ where: { sku: B }, data: { reserved: 0 } });
});
