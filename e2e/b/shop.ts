import { expect, test, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { db } from '../helpers';
import { SIGNATURE_HEADER, sign } from '../../src/server/payments/signature';

// Shared storefront fixtures for B's checkout and order tests. Customers are created per test and signed in
// by writing a session row (the sign-in pages belong to person A). Call `cleanupShop()` in afterAll.

export const SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'dev-only-webhook-secret-change-me';
export const CRON = process.env.CRON_SECRET || '';
const OUTBOX = path.resolve(process.env.MAIL_OUTBOX_DIR || './storage/outbox');
export const stamp = () => Date.now().toString(36) + randomBytes(2).toString('hex');

const made: string[] = [], products: string[] = [];

export async function cleanupShop() {
  const orders = (await db.order.findMany({ where: { customerId: { in: made } }, select: { id: true } })).map(o => o.id);
  await db.paymentEvent.deleteMany({ where: { payment: { orderId: { in: orders } } } });
  await db.serialNumber.deleteMany({ where: { sku: { in: products } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  await db.customer.deleteMany({ where: { id: { in: made } } });
  await db.stockMove.deleteMany({ where: { sku: { in: products } } });
  await db.inventoryItem.deleteMany({ where: { sku: { in: products } } });
  for (const f of mails().filter(m => m.to.endsWith('@e2e.example'))) rmSync(path.join(OUTBOX, f.file), { force: true });
}

/** A product only this test uses, so stock numbers are exact. With `serials`, it is serial-tracked and those units are on the shelf. */
export async function product(price: number, qty: number, serials?: string[]) {
  const sku = `E2E-CO-${stamp()}`.toUpperCase();
  products.push(sku);
  await db.inventoryItem.create({ data: { sku, name: `E2E สินค้า ${sku}`, cat: 'ทดสอบ', unit: 'ชิ้น', qty, min: 0, cost: price / 2, price, loc: 'E2E-01', active: true, serialTracked: !!serials } });
  if (serials) await db.serialNumber.createMany({ data: serials.map(serial => ({ serial, sku, receivedRef: 'E2E' })) });
  return sku;
}

/** A signed-in customer whose cart holds `items`. */
export async function customer(page: Page, items: Record<string, number>) {
  const c = await db.customer.create({ data: { email: `c-${stamp()}@e2e.example`, passwordHash: '-', name: `ลูกค้าทดสอบ ${stamp()}`, phone: '0800000000' } });
  made.push(c.id);
  await db.cart.create({ data: { customerId: c.id, items: { create: Object.entries(items).map(([sku, qty]) => ({ sku, qty })) } } });
  const token = randomBytes(32).toString('base64url');
  await db.customerSession.create({ data: { id: createHash('sha256').update(token).digest('hex'), customerId: c.id, expiresAt: new Date(Date.now() + 864e5) } });
  await page.context().addCookies([{ name: 'cp_session', value: token, url: test.info().project.use.baseURL || 'http://localhost:3000' }]);
  return c;
}

export async function fillAddress(page: Page, province: string) {
  await page.goto('/checkout');
  await page.fill('#co-name', 'ผู้รับ ทดสอบ');
  await page.fill('#co-phone', '081-234-5678');
  await page.fill('#co-line1', '1 ถนนทดสอบ');
  await page.fill('#co-subdistrict', 'ตำบลทดสอบ');
  await page.fill('#co-district', 'อำเภอทดสอบ');
  await page.selectOption('#co-province', province);
  await page.fill('#co-postcode', '10110');
}

/** Places the order through the checkout page; returns its id once the payment page is open. */
export async function checkout(page: Page, province = 'เชียงใหม่') {
  await fillAddress(page, province);
  await page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click();
  await expect(page).toHaveURL(/\/pay\/ORD-\d{4}-\d{6}$/);
  return decodeURIComponent(page.url().split('/pay/')[1]);
}

export const item = (sku: string) => db.inventoryItem.findUniqueOrThrow({ where: { sku } });
export const order = (id: string) => db.order.findUniqueOrThrow({ where: { id }, include: { payments: true, lines: true } });

export function mails(): { to: string; subject: string; text: string; file: string }[] {
  try { return readdirSync(OUTBOX).filter(f => f.endsWith('.json')).map(f => ({ ...JSON.parse(readFileSync(path.join(OUTBOX, f), 'utf8')), file: f })); } catch { return []; }
}

export async function webhook(page: Page, body: string, signature = sign(body, SECRET)) {
  return page.request.post('/api/payments/webhook', { data: body, headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature } });
}
export const event = (ref: string, amount: string, id = 'evt_e2e_' + stamp()) => JSON.stringify({ id, type: 'charge.successful', data: { ref, amount, paid_at: new Date().toISOString() } });

/** Customer orders `items` and pays (signed webhook, as the provider would). Returns the order id. */
export async function paidOrder(page: Page, items: Record<string, number>, province = 'เชียงใหม่') {
  const c = await customer(page, items);
  const id = await checkout(page, province);
  const o = await order(id);
  expect(await (await webhook(page, event(o.payments[0].providerRef!, Number(o.total).toFixed(2)))).json()).toMatchObject({ result: 'paid' });
  return { id, c };
}
