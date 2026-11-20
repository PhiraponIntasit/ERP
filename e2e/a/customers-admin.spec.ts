import { test, expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { db, loginAs, USERS } from '../helpers';

// Back office › ลูกค้า: list / search / filter storefront accounts, see one customer's orders,
// and suspend (signs them out everywhere) or reopen an account.

const P = 'e2e-cadm-';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test.afterAll(async () => {
  await db.customer.deleteMany({ where: { email: { startsWith: P } } });
});

async function makeCustomer(tag: string, active = true) {
  return db.customer.create({ data: { email: `${P}${tag}-${Date.now()}@example.com`, passwordHash: 'x', name: `ทดสอบ ${tag}`, phone: '0812345678', active } });
}

/** Signs `page` in as the customer by planting a session the way customer-session.ts stores it. */
async function signInCustomer(page: Page, customerId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.customerSession.create({ data: { id: sha256(token), customerId, expiresAt: new Date(Date.now() + 864e5) } });
  const url = new URL(page.url() === 'about:blank' ? process.env.E2E_BASE_URL ?? 'http://localhost:3000' : page.url());
  await page.context().addCookies([{ name: 'cp_session', value: token, domain: url.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
}

test('manager lists, searches and filters customers', async ({ page }) => {
  const off = await makeCustomer('off', false);
  await loginAs(page, USERS.manager);
  await page.goto('/customers');
  const table = page.getByRole('table', { name: 'ลูกค้า' });
  await expect(table.locator('tr[data-customer="customer@example.com"]')).toContainText('มานี ใจดี');

  await page.getByRole('searchbox', { name: 'ค้นหาลูกค้า' }).fill('customer@example');
  await page.getByRole('button', { name: 'ค้นหา' }).click();
  await expect(page).toHaveURL(/q=customer%40example/);
  await expect(table.locator('tbody tr')).toHaveCount(1);

  await page.goto('/customers?tab=suspended');
  await expect(table.locator(`tr[data-customer="${off.email}"]`)).toContainText('ระงับ');
  await expect(table.locator('tr[data-customer="customer@example.com"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /ระงับ \d+/ })).toHaveAttribute('aria-current', 'page');
});

test('customer page shows contact details and orders', async ({ page }) => {
  await loginAs(page, USERS.manager);
  await page.goto('/customers?q=customer%40example.com');
  await page.getByRole('link', { name: 'มานี ใจดี' }).click();
  await expect(page).toHaveURL(/\/customers\/cus-demo$/);
  await expect(page.getByRole('heading', { name: /มานี ใจดี/ })).toBeVisible();
  await expect(page.getByText('customer@example.com')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ที่อยู่จัดส่ง' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /คำสั่งซื้อล่าสุด/ })).toBeVisible();
});

test('suspending signs the customer out; reopening lets them back in', async ({ page, browser }) => {
  const c = await makeCustomer('sus');
  const shop = await (await browser.newContext()).newPage();
  await signInCustomer(shop, c.id);
  await shop.goto('/checkout');
  await expect(shop.getByText('กรุณาเข้าสู่ระบบลูกค้าก่อนสั่งซื้อ')).toHaveCount(0);

  await loginAs(page, USERS.manager);
  await page.goto(`/customers/${c.id}`);
  await expect(page.getByText('เข้าสู่ระบบอยู่ 1 อุปกรณ์')).toBeVisible();
  await page.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(page.getByText(`ระงับบัญชี ${c.email} แล้ว`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดใช้บัญชี' })).toBeVisible();
  await expect(page.getByText('ไม่ได้เข้าสู่ระบบ')).toBeVisible();

  expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).active).toBe(false);
  expect(await db.customerSession.count({ where: { customerId: c.id } })).toBe(0);
  await shop.reload();
  await expect(shop.getByText('กรุณาเข้าสู่ระบบลูกค้าก่อนสั่งซื้อ')).toBeVisible();
  expect(await db.auditLog.count({ where: { cat: 'customer', action: 'ระงับบัญชีลูกค้า', target: c.email } })).toBe(1); // append-only: test rows stay

  await page.getByRole('button', { name: 'เปิดใช้บัญชี' }).click();
  await expect(page.getByText(`เปิดใช้บัญชี ${c.email} แล้ว`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ระงับบัญชี' })).toBeVisible();
  await signInCustomer(shop, c.id);
  await shop.reload();
  await expect(shop.getByText('กรุณาเข้าสู่ระบบลูกค้าก่อนสั่งซื้อ')).toHaveCount(0);
  await shop.context().close();
});

test('an unknown customer id is a 404', async ({ page }) => {
  await loginAs(page, USERS.admin);
  const res = await page.goto('/customers/no-such-customer');
  expect(res?.status()).toBe(404);
});
