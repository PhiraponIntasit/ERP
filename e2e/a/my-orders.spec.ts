import { test, expect, type Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { db } from '../helpers';

// "คำสั่งซื้อของฉัน": a customer sees only their own orders, newest first, grouped by status,
// with the next step for each (pay / track / details on B's /pay/[id]). Orders are written straight to the
// database (ids E2E-MO-…) so every status is covered; customers use @e2e-orders.example. All removed afterwards.
const n = Date.now().toString(36).toUpperCase();
const DOMAIN = '@e2e-orders.example', PW = 'orders-pass-123';
const id = (k: string) => `E2E-MO-${n}-${k}`;
const HOUR = 36e5;
let me = '', other = '';

async function order(customerId: string, k: string, status: string, ageH: number, extra: Record<string, unknown> = {}) {
  const created = new Date(Date.now() - ageH * HOUR);
  await db.order.create({ data: {
    id: id(k), customerId, status, subtotal: 6990, total: 6990, shipName: 'ผู้รับ ทดสอบ', shipPhone: '0812345678', shipAddress: '1 ถนนทดสอบ กรุงเทพมหานคร 10110',
    createdAt: created, expiresAt: new Date(created.getTime() + 0.25 * HOUR), ...extra,
    lines: { create: [{ sku: 'CPU-R5-7600', name: 'AMD Ryzen 5 7600', price: 6990, qty: 1 }, ...(k === 'SHIP' ? [{ sku: 'HDMI-2M', name: 'HDMI 2.1 Cable 2m', price: 290, qty: 2 }] : [])] },
  } });
}

test.beforeAll(async () => {
  const hash = await bcrypt.hash(PW, 10);
  me = (await db.customer.create({ data: { email: `me-${n}${DOMAIN}`.toLowerCase(), name: 'ลูกค้า ประวัติ', passwordHash: hash } })).id;
  other = (await db.customer.create({ data: { email: `other-${n}${DOMAIN}`.toLowerCase(), name: 'คนอื่น', passwordHash: hash } })).id;
  await order(me, 'DONE', 'completed', 300, { paidAt: new Date(), completedAt: new Date() });
  await order(me, 'CANCEL', 'cancelled', 200);
  await order(me, 'SHIP', 'shipped', 50, { paidAt: new Date(), shippedAt: new Date(), carrier: 'Kerry Express', trackingNo: 'KEX123456789' });
  await order(me, 'LATE', 'pending_payment', 5);                                          // deadline already passed
  await order(me, 'PAY', 'pending_payment', 0, { expiresAt: new Date(Date.now() + 0.2 * HOUR) });
  await order(other, 'OTHER', 'paid', 1, { paidAt: new Date() });
});
test.afterAll(async () => {
  await db.order.deleteMany({ where: { id: { startsWith: `E2E-MO-${n}` } } });
  await db.customer.deleteMany({ where: { email: { endsWith: DOMAIN } } });
});

async function signIn(page: Page, next: string) {
  await page.goto(`/account/login?next=${encodeURIComponent(next)}`);
  await page.fill('#cl-email', `me-${n}${DOMAIN}`.toLowerCase());
  await page.fill('#cl-password', PW);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(new RegExp(`:\\d+${next.replace(/[?]/g, '\\?')}$`));
}
const card = (page: Page, k: string) => page.locator(`[data-order="${id(k)}"]`);

test('own orders only, newest first, with the next step for each', async ({ page }) => {
  await signIn(page, '/account/orders');
  const ids = await page.locator('[data-order]').evaluateAll(els => els.map(e => e.getAttribute('data-order')));
  expect(ids).toEqual(['PAY', 'LATE', 'SHIP', 'CANCEL', 'DONE'].map(id));            // not the other customer's

  await expect(card(page, 'PAY')).toContainText('รอชำระเงิน');
  await expect(card(page, 'PAY').getByRole('link', { name: 'ชำระเงิน' })).toHaveAttribute('href', `/pay/${id('PAY')}`);
  await expect(card(page, 'LATE')).toContainText('หมดเวลาชำระเงิน');                  // past its deadline
  await expect(card(page, 'LATE').getByRole('link', { name: 'ชำระเงิน' })).toHaveCount(0);
  await expect(card(page, 'SHIP')).toContainText('Kerry Express KEX123456789');
  await expect(card(page, 'SHIP')).toContainText('AMD Ryzen 5 7600 และอีก 1 รายการ');
  await expect(card(page, 'SHIP')).toContainText('3 ชิ้น');
  await card(page, 'SHIP').getByRole('link', { name: 'ติดตามและยืนยันรับสินค้า' }).click();
  await expect(page).toHaveURL(new RegExp(`/pay/${id('SHIP')}$`));

  // someone else's order can't be opened either
  expect((await page.goto(`/pay/${id('OTHER')}`))!.status()).toBe(404);
});

test('status tabs filter the list and show counts', async ({ page }) => {
  await signIn(page, '/account/orders');
  const tabs = page.getByRole('group', { name: 'สถานะคำสั่งซื้อ' });
  await expect(tabs.getByRole('link', { name: /^ทั้งหมด/ })).toContainText('(5)');
  await tabs.getByRole('link', { name: /^กำลังดำเนินการ/ }).click();
  await expect(page).toHaveURL(/tab=active/);
  await expect(page.locator('[data-order]')).toHaveCount(1);
  await expect(card(page, 'SHIP')).toBeVisible();
  await tabs.getByRole('link', { name: /^ยกเลิก/ }).click();
  await expect(page.locator('[data-order]')).toHaveCount(1);
  await expect(card(page, 'CANCEL')).toBeVisible();
  await tabs.getByRole('link', { name: /^สำเร็จ/ }).click();
  await expect(card(page, 'DONE')).toBeVisible();
});

test('the account page shows the latest three; a signed-out link to an order comes back after sign-in', async ({ page }) => {
  await page.goto(`/pay/${id('DONE')}`);
  await page.getByRole('link', { name: 'เข้าสู่ระบบ' }).last().click();
  await page.fill('#cl-email', `me-${n}${DOMAIN}`.toLowerCase());
  await page.fill('#cl-password', PW);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(new RegExp(`:\\d+/pay/${id('DONE')}$`));

  await page.goto('/account');
  const recent = page.getByRole('region', { name: 'คำสั่งซื้อล่าสุด' });
  await expect(recent.locator('[data-order]')).toHaveCount(3);
  await recent.getByRole('link', { name: 'ดูทั้งหมด' }).click();
  await expect(page).toHaveURL(/\/account\/orders$/);
});
