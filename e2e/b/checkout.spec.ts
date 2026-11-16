import { test, expect, type Browser, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { db } from '../helpers';
import { FREE_SHIPPING_MIN, PROVINCES, provinceOf, shippingFee } from '../../src/lib/shipping';
import { crc16, parsePromptPay, promptPayPayload } from '../../src/lib/promptpay';
import { SIGNATURE_HEADER, sign, verify } from '../../src/server/payments/signature';

// Checkout → PromptPay QR (demo) → signed webhook → paid & stock cut; expiry and cancellation release held stock.
// Customers are made per test and signed in by writing a session row (the sign-in pages belong to person A).

const SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'dev-only-webhook-secret-change-me';
const CRON = process.env.CRON_SECRET || '';
const OUTBOX = path.resolve(process.env.MAIL_OUTBOX_DIR || './storage/outbox');
const stamp = () => Date.now().toString(36) + randomBytes(2).toString('hex');

// ── fixtures ──

const made: string[] = [], products: string[] = [];
test.afterAll(async () => {
  const orders = await db.order.findMany({ where: { customerId: { in: made } }, select: { id: true } });
  await db.paymentEvent.deleteMany({ where: { payment: { orderId: { in: orders.map(o => o.id) } } } });
  await db.serialNumber.updateMany({ where: { orderLine: { orderId: { in: orders.map(o => o.id) } } }, data: { orderLineId: null } });
  await db.order.deleteMany({ where: { id: { in: orders.map(o => o.id) } } });
  await db.customer.deleteMany({ where: { id: { in: made } } });
  await db.stockMove.deleteMany({ where: { sku: { in: products } } });
  await db.inventoryItem.deleteMany({ where: { sku: { in: products } } });
  for (const f of mails().filter(m => m.to.endsWith('@e2e.example'))) rmSync(path.join(OUTBOX, f.file), { force: true });
});

/** A product only this test uses, so stock numbers are exact. */
async function product(price: number, qty: number) {
  const sku = `E2E-CO-${stamp()}`.toUpperCase();
  products.push(sku);
  await db.inventoryItem.create({ data: { sku, name: `E2E สินค้า ${sku}`, cat: 'ทดสอบ', unit: 'ชิ้น', qty, min: 0, cost: price / 2, price, loc: '-', active: true } });
  return sku;
}

/** A signed-in customer whose cart holds `items`. */
async function customer(page: Page, items: Record<string, number>) {
  const c = await db.customer.create({ data: { email: `c-${stamp()}@e2e.example`, passwordHash: '-', name: `ลูกค้าทดสอบ ${stamp()}`, phone: '0800000000' } });
  made.push(c.id);
  await db.cart.create({ data: { customerId: c.id, items: { create: Object.entries(items).map(([sku, qty]) => ({ sku, qty })) } } });
  const token = randomBytes(32).toString('base64url');
  await db.customerSession.create({ data: { id: createHash('sha256').update(token).digest('hex'), customerId: c.id, expiresAt: new Date(Date.now() + 864e5) } });
  await page.context().addCookies([{ name: 'cp_session', value: token, url: test.info().project.use.baseURL || 'http://localhost:3000' }]);
  return c;
}

async function fillAddress(page: Page, province: string) {
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
async function checkout(page: Page, province = 'เชียงใหม่') {
  await fillAddress(page, province);
  await page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click();
  await expect(page).toHaveURL(/\/pay\/ORD-\d{4}-\d{6}$/);
  return decodeURIComponent(page.url().split('/pay/')[1]);
}

const item = (sku: string) => db.inventoryItem.findUniqueOrThrow({ where: { sku } });
const order = (id: string) => db.order.findUniqueOrThrow({ where: { id }, include: { payments: true, lines: true } });

function mails(): { to: string; subject: string; text: string; file: string }[] {
  try { return readdirSync(OUTBOX).filter(f => f.endsWith('.json')).map(f => ({ ...JSON.parse(readFileSync(path.join(OUTBOX, f), 'utf8')), file: f })); } catch { return []; }
}

async function webhook(page: Page, body: string, signature = sign(body, SECRET)) {
  return page.request.post('/api/payments/webhook', { data: body, headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature } });
}
const event = (ref: string, amount: string, id = 'evt_e2e_' + stamp()) => JSON.stringify({ id, type: 'charge.successful', data: { ref, amount, paid_at: new Date().toISOString() } });

// ── rules ──

test('shipping: Bangkok & vicinity free, upcountry ฿150, ฿2,000 or more free everywhere', () => {
  expect(PROVINCES).toHaveLength(77);
  for (const p of ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม']) expect(shippingFee(p, 100)).toBe(0);
  expect(shippingFee('เชียงใหม่', 100)).toBe(150);
  expect(shippingFee('เชียงใหม่', 1999.99)).toBe(150);
  expect(shippingFee('เชียงใหม่', FREE_SHIPPING_MIN)).toBe(0); // exactly ฿2,000 is free
  expect(shippingFee('สงขลา', 25000)).toBe(0);
  expect([provinceOf('กทม.'), provinceOf('จ. นนทบุรี'), provinceOf('จังหวัดเชียงใหม่'), provinceOf('Atlantis')]).toEqual(['กรุงเทพมหานคร', 'นนทบุรี', 'เชียงใหม่', null]);
});

test('PromptPay payload: EMVCo CRC, exact amount, valid IDs only', () => {
  expect(crc16('123456789')).toBe('29B1'); // CRC-16/CCITT-FALSE check value
  const p = promptPayPayload('0000000000000', 6990);
  expect(p).toMatch(/^000201010212/);
  expect(parsePromptPay(p)).toEqual({ amount: 6990, account: '0000000000000' });
  expect(parsePromptPay(p.slice(0, -1) + (p.endsWith('0') ? '1' : '0'))).toBeNull(); // any change breaks the CRC
  expect(() => promptPayPayload('12345', 10)).toThrow();
  expect(() => promptPayPayload('0000000000000', 0)).toThrow();
});

test('webhook signatures: tampering and replays are refused', () => {
  const body = '{"a":1}', now = Math.floor(Date.now() / 1000);
  expect(verify(sign(body, SECRET, now), body, SECRET, now)).toBe(true);
  expect(verify(sign(body, SECRET, now), '{"a":2}', SECRET, now)).toBe(false);
  expect(verify(sign(body, 'another-secret-entirely', now), body, SECRET, now)).toBe(false);
  expect(verify(sign(body, SECRET, now - 600), body, SECRET, now)).toBe(false); // older than 5 minutes
  expect(verify(null, body, SECRET, now)).toBe(false);
});

// ── the whole flow ──

test('checkout → QR → simulated transfer → paid, stock cut, receipt emailed', async ({ page }) => {
  const sku = await product(250, 10);
  const c = await customer(page, { [sku]: 2 });
  await fillAddress(page, 'เชียงใหม่');
  await expect(page.getByTestId('ship-fee')).toHaveText('฿150.00');
  await expect(page.getByTestId('grand')).toHaveText('฿650.00');
  await page.selectOption('#co-province', 'นนทบุรี');
  await expect(page.getByTestId('ship-fee')).toHaveText('ฟรี');
  await page.selectOption('#co-province', 'เชียงใหม่');
  await page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click();
  await expect(page).toHaveURL(/\/pay\/ORD-/);
  const id = decodeURIComponent(page.url().split('/pay/')[1]);

  // Order waits for payment and holds the stock; the cart is emptied
  let o = await order(id);
  expect(o).toMatchObject({ status: 'pending_payment', customerId: c.id, shipName: 'ผู้รับ ทดสอบ', shipPhone: '0812345678' });
  expect([Number(o.subtotal), Number(o.shippingFee), Number(o.total)]).toEqual([500, 150, 650]);
  expect(o.expiresAt.getTime() - o.createdAt.getTime()).toBeCloseTo(15 * 60_000, -4);
  expect(await item(sku)).toMatchObject({ qty: 10, reserved: 2 });
  expect(await db.cartItem.count({ where: { cart: { customerId: c.id } } })).toBe(0);
  expect(await db.address.count({ where: { customerId: c.id, isDefault: true } })).toBe(1); // first address is saved
  // The QR on screen carries exactly the order total
  expect(parsePromptPay(o.payments[0].qrImage!)?.amount).toBe(650);
  await expect(page.getByRole('img', { name: 'QR PromptPay ยอด ฿650.00' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('โหมดเดโม');
  await expect(page.getByTestId('countdown')).toHaveText(/^1[45]:\d\d$/);
  await expect.poll(() => mails().filter(m => m.to === c.email && m.subject.includes(`ยืนยันคำสั่งซื้อ ${id}`)).length).toBe(1);

  await page.getByRole('button', { name: 'จำลองการโอนเงิน (เดโม)' }).click();
  await expect(page.getByRole('heading', { name: 'ชำระเงินสำเร็จ' })).toBeVisible();

  o = await order(id);
  expect(o.status).toBe('paid');
  expect(o.paidAt).not.toBeNull();
  expect(o.payments[0]).toMatchObject({ status: 'successful' });
  expect(await item(sku)).toMatchObject({ qty: 8, reserved: 0 });
  expect(await db.stockMove.count({ where: { sku, type: 'sale', qty: 2, ref: id } })).toBe(1);
  expect(await db.paymentEvent.count({ where: { paymentId: o.payments[0].id } })).toBe(1);
  expect(await db.auditLog.count({ where: { cat: 'order', target: id, action: { in: ['สั่งซื้อ', 'ชำระเงินสำเร็จ · ตัดสต็อก'] } } })).toBe(2);
  await expect.poll(() => mails().filter(m => m.to === c.email && m.subject.includes(`ใบเสร็จคำสั่งซื้อ ${id}`)).length).toBe(1);
});

test('free shipping from exactly ฿2,000, and in Bangkok whatever the amount', async ({ browser }) => {
  const a = await product(1000, 5), b = await product(99, 5);
  const p1 = await (await browser.newContext()).newPage();
  await customer(p1, { [a]: 2 });
  const o1 = await order(await checkout(p1, 'สงขลา'));
  expect([Number(o1.subtotal), Number(o1.shippingFee), Number(o1.total)]).toEqual([2000, 0, 2000]);

  const p2 = await (await browser.newContext()).newPage();
  await customer(p2, { [b]: 1 });
  const o2 = await order(await checkout(p2, 'กรุงเทพมหานคร'));
  expect([Number(o2.shippingFee), Number(o2.total)]).toEqual([0, 99]);
});

// ── webhook rules ──

test('webhook: unsigned, wrong amount and repeated deliveries change nothing', async ({ page }) => {
  const sku = await product(300, 4);
  await customer(page, { [sku]: 1 });
  const id = await checkout(page);
  const { providerRef: ref } = (await order(id)).payments[0];

  expect((await webhook(page, event(ref!, '300.00'), 't=1,v1=' + '0'.repeat(64))).status()).toBe(401);
  expect((await webhook(page, event(ref!, '300.00'), sign(event(ref!, '300.00'), 'not-the-shop-secret'))).status()).toBe(401);
  const wrong = await webhook(page, event(ref!, '30.00'));
  expect(await wrong.json()).toMatchObject({ result: 'amount mismatch' });
  expect((await order(id)).status).toBe('pending_payment');

  const body = event(ref!, '450.00'); // 300 + ฿150 upcountry shipping
  expect(await (await webhook(page, body)).json()).toMatchObject({ result: 'paid' });
  expect(await (await webhook(page, body)).json()).toMatchObject({ result: 'duplicate event' });
  expect(await (await webhook(page, event(ref!, '450.00'))).json()).toMatchObject({ result: 'already applied' }); // new event id, same charge
  expect((await order(id)).status).toBe('paid');
  expect(await item(sku)).toMatchObject({ qty: 3, reserved: 0 }); // cut once
  expect(await db.stockMove.count({ where: { sku, type: 'sale' } })).toBe(1);
});

// ── expiry & cancellation ──

test('unpaid past the deadline: cron expires it and releases the stock; a late payment is flagged for refund', async ({ page }) => {
  test.skip(!CRON, 'CRON_SECRET not set for this run');
  const sku = await product(500, 3);
  await customer(page, { [sku]: 2 });
  const id = await checkout(page);
  expect(await item(sku)).toMatchObject({ reserved: 2 });
  await db.order.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

  expect((await page.request.get('/api/cron/expire-orders')).status()).toBe(401);
  expect((await page.request.get('/api/cron/expire-orders', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  const r = await page.request.get('/api/cron/expire-orders', { headers: { authorization: `Bearer ${CRON}` } });
  expect((await r.json()).expired).toBeGreaterThanOrEqual(1);
  const o = await order(id);
  expect(o.status).toBe('expired');
  expect(o.payments[0].status).toBe('expired');
  expect(await item(sku)).toMatchObject({ qty: 3, reserved: 0 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'หมดเวลาชำระเงิน' })).toBeVisible();
  // Money that arrives anyway is recorded, never turns the order into a sale, and is flagged for refund
  expect(await (await webhook(page, event(o.payments[0].providerRef!, '1150.00'))).json()).toMatchObject({ result: 'late payment' });
  expect((await order(id)).status).toBe('expired');
  expect(await item(sku)).toMatchObject({ qty: 3, reserved: 0 });
  expect(await db.auditLog.count({ where: { target: id, action: { contains: 'ต้องคืนเงิน' } } })).toBe(1);
});

test('the payment page expires an overdue order on its own', async ({ page }) => {
  const sku = await product(120, 2);
  await customer(page, { [sku]: 1 });
  const id = await checkout(page);
  await db.order.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 2000) } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'หมดเวลาชำระเงิน' })).toBeVisible({ timeout: 15_000 });
  expect(await item(sku)).toMatchObject({ qty: 2, reserved: 0 });
  await expect(page.getByRole('button', { name: /จำลองการโอนเงิน/ })).toHaveCount(0);
});

test('the customer can cancel while unpaid', async ({ page }) => {
  const sku = await product(120, 2);
  await customer(page, { [sku]: 2 });
  const id = await checkout(page);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'ยกเลิกคำสั่งซื้อ' }).click();
  await expect(page.getByRole('heading', { name: 'ยกเลิก' })).toBeVisible();
  expect((await order(id)).status).toBe('cancelled');
  expect(await item(sku)).toMatchObject({ qty: 2, reserved: 0 });
});

// ── stock & privacy ──

async function signedIn(browser: Browser, items: Record<string, number>) {
  const page = await (await browser.newContext()).newPage();
  return { page, c: await customer(page, items) };
}

test('two customers, one unit left: exactly one order goes through', async ({ browser }) => {
  const sku = await product(800, 1);
  const [a, b] = [await signedIn(browser, { [sku]: 1 }), await signedIn(browser, { [sku]: 1 })];
  await Promise.all([fillAddress(a.page, 'นนทบุรี'), fillAddress(b.page, 'นนทบุรี')]);
  await Promise.all([a, b].map(x => x.page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click()));
  await expect.poll(async () => db.order.count({ where: { customerId: { in: [a.c.id, b.c.id] } } })).toBe(1);
  const loser = (await db.order.count({ where: { customerId: a.c.id } })) ? b.page : a.page;
  await expect(loser.locator('.err')).toContainText('เหลือไม่พอ — สั่งได้ 0 ชิ้น');
  expect(await item(sku)).toMatchObject({ qty: 1, reserved: 1 });
});

test('an order is visible only to its own customer', async ({ browser }) => {
  const sku = await product(150, 2);
  const owner = await signedIn(browser, { [sku]: 1 });
  const id = await checkout(owner.page);
  const other = await signedIn(browser, {});
  const res = await other.page.goto(`/pay/${id}`);
  expect(res?.status()).toBe(404);
  expect((await other.page.request.get(`/api/orders/${id}/status`)).status()).toBe(404);
  expect((await (await (await browser.newContext()).newPage()).request.get(`/api/orders/${id}/status`)).status()).toBe(401);
});
