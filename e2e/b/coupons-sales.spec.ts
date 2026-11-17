import { test, expect, type Browser, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { checkout, cleanupShop, customer, fillAddress, order, paidOrder, product, stamp } from './shop';
import { describe, discountFor } from '../../src/lib/coupon';

// Coupons (rules, checkout, limits, give-back on unpaid orders, back-office management) and the sales report.

const codes: string[] = [];
test.afterAll(async () => {
  await cleanupShop();
  await db.coupon.deleteMany({ where: { code: { in: codes } } });
});

const day = 864e5;
async function coupon(data: Partial<{ kind: string; value: number; maxDiscount: number; minSpend: number; usageLimit: number; oncePerCustomer: boolean; startsAt: Date; endsAt: Date }>) {
  const code = `E2E${stamp().toUpperCase()}`.slice(0, 20);
  codes.push(code);
  await db.coupon.create({ data: { code, kind: 'fixed', value: 100, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day), ...data } });
  return code;
}
const used = async (code: string) => (await db.coupon.findUniqueOrThrow({ where: { code } })).used;

async function apply(page: Page, code: string) {
  await page.getByLabel('โค้ดส่วนลด').fill(code);
  await page.getByRole('button', { name: 'ใช้คูปอง' }).click();
}
const place = (page: Page) => page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click();

test('discount arithmetic: percent with a cap, fixed never above the goods, minimum spend', () => {
  expect(discountFor({ kind: 'percent', value: 10, maxDiscount: 500, minSpend: 0 }, 3000)).toBe(300);
  expect(discountFor({ kind: 'percent', value: 10, maxDiscount: 500, minSpend: 0 }, 9000)).toBe(500);
  expect(discountFor({ kind: 'percent', value: 12.5, maxDiscount: null, minSpend: 0 }, 99.99)).toBe(12.5);
  expect(discountFor({ kind: 'fixed', value: 300, maxDiscount: null, minSpend: 0 }, 250)).toBe(250);
  expect(discountFor({ kind: 'fixed', value: 300, maxDiscount: null, minSpend: 3000 }, 2999.99)).toBe(0);
  expect(describe({ kind: 'percent', value: 10, maxDiscount: 500, minSpend: 1000 })).toBe('ลด 10% (สูงสุด ฿500) · ซื้อขั้นต่ำ ฿1,000');
});

test('checkout with a coupon: discount, shipping from the discounted amount, a use is taken', async ({ page }) => {
  const sku = await product(1000, 5);
  const code = await coupon({ kind: 'fixed', value: 300, minSpend: 3000, usageLimit: 5 });
  await customer(page, { [sku]: 3 });
  await fillAddress(page, 'เชียงใหม่');
  await apply(page, code.toLowerCase()); // codes are case-insensitive
  await expect(page.getByTestId('discount')).toHaveText('−฿300.00');
  await expect(page.getByTestId('ship-fee')).toHaveText('ฟรี');          // 2,700 after discount ≥ 2,000
  await expect(page.getByTestId('grand')).toHaveText('฿2,700.00');
  await place(page);
  await expect(page).toHaveURL(/\/pay\//);
  const o = await order(decodeURIComponent(page.url().split('/pay/')[1]));
  expect([Number(o.subtotal), Number(o.discount), Number(o.shippingFee), Number(o.total), o.couponCode]).toEqual([3000, 300, 0, 2700, code]);
  expect(o.lines.map(l => Number(l.cost))).toEqual([500]); // cost recorded for the profit report
  expect(await used(code)).toBe(1);
});

test('a discount that brings goods under ฿2,000 brings the upcountry fee back', async ({ page }) => {
  const sku = await product(2100, 2);
  const code = await coupon({ kind: 'fixed', value: 200 });
  await customer(page, { [sku]: 1 });
  await fillAddress(page, 'สงขลา');
  await expect(page.getByTestId('ship-fee')).toHaveText('ฟรี');
  await apply(page, code);
  await expect(page.getByTestId('ship-fee')).toHaveText('฿150.00');
  await place(page);
  await expect(page).toHaveURL(/\/pay\//);
  const o = await order(decodeURIComponent(page.url().split('/pay/')[1]));
  expect([Number(o.discount), Number(o.shippingFee), Number(o.total)]).toEqual([200, 150, 2050]);
});

test('codes that do not apply say why', async ({ page }) => {
  const sku = await product(500, 5);
  const c = await customer(page, { [sku]: 1 });
  const expired = await coupon({ startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() - day) });
  const later = await coupon({ startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 3 * day) });
  const big = await coupon({ minSpend: 1000 });
  const off = await coupon({});
  await db.coupon.update({ where: { code: off }, data: { active: false } });
  const once = await coupon({ oncePerCustomer: true });
  await db.order.create({ data: { id: `E2E-${stamp()}`, customerId: c.id, status: 'completed', subtotal: 500, discount: 100, shippingFee: 0, total: 400, couponCode: once, shipName: '-', shipPhone: '-', shipAddress: '-', expiresAt: new Date() } });

  await fillAddress(page, 'นนทบุรี');
  for (const [code, msg] of [['NOPE-CODE', 'ไม่พบคูปองนี้'], [expired, 'หมดอายุแล้ว'], [later, 'ยังไม่เริ่มใช้'], [big, 'ใช้เมื่อซื้อสินค้าครบ ฿1,000'], [off, 'ไม่พบคูปองนี้'], [once, 'คุณใช้คูปองนี้ไปแล้ว']]) {
    await apply(page, code);
    await expect(page.getByText(msg)).toBeVisible();
  }
  await expect(page.getByTestId('discount')).toHaveCount(0);
});

async function shopper(browser: Browser, items: Record<string, number>) {
  const page = await (await browser.newContext()).newPage();
  return { page, c: await customer(page, items) };
}

test('last use of a limited code: one order gets it; an unpaid order gives it back', async ({ browser }) => {
  const sku = await product(800, 10);
  const code = await coupon({ usageLimit: 1 });
  const [sa, sb] = [await shopper(browser, { [sku]: 1 }), await shopper(browser, { [sku]: 1 })];
  const [a, b] = [sa.page, sb.page];
  for (const p of [a, b]) { await fillAddress(p, 'นนทบุรี'); await apply(p, code); await expect(p.getByTestId('discount')).toBeVisible(); }
  await Promise.all([place(a), place(b)]);
  await expect.poll(() => db.order.count({ where: { couponCode: code } })).toBe(1);
  const aWon = (await db.order.findFirstOrThrow({ where: { couponCode: code } })).customerId === sa.c.id;
  const winner = aWon ? a : b, loser = aWon ? b : a;
  await expect(winner).toHaveURL(/\/pay\//);
  await expect(loser.locator('.err')).toContainText('คูปองนี้ถูกใช้ครบจำนวนแล้ว');
  expect(await used(code)).toBe(1);

  // The winner walks away without paying → the use returns and the other shopper can have it
  winner.once('dialog', d => d.accept());
  await winner.getByRole('button', { name: 'ยกเลิกคำสั่งซื้อ' }).click();
  await expect(winner.getByRole('heading', { name: 'ยกเลิก' })).toBeVisible();
  expect(await used(code)).toBe(0);
  await place(loser); // the code is still applied on their checkout page

  await expect(loser).toHaveURL(/\/pay\//);
  expect(await used(code)).toBe(1);
});

test('managing coupons: validation, create, limits, switch off', async ({ page }) => {
  const code = `E2EM${stamp().toUpperCase()}`.slice(0, 20);
  codes.push(code);
  await loginAs(page, USERS.manager);
  await page.goto('/coupons');
  await page.getByRole('button', { name: '+ สร้างคูปอง' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#cp-code').fill('ไม่ถูก');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg.locator('.err')).toContainText('โค้ดใช้ได้เฉพาะ');
  await dlg.locator('#cp-code').fill(code.toLowerCase());
  await dlg.locator('#cp-value').fill('120');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg.locator('.err')).toContainText('ไม่เกิน 100');
  await dlg.locator('#cp-value').fill('12');
  await dlg.locator('#cp-maxDiscount').fill('400');
  await dlg.locator('#cp-usageLimit').fill('3');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg).toBeHidden();
  const row = page.locator('tr', { hasText: code });
  await expect(row).toContainText('ลด 12% (สูงสุด ฿400)');
  await expect(row).toContainText('ใช้งานได้');
  const c = await db.coupon.findUniqueOrThrow({ where: { code } });
  expect([c.kind, Number(c.value), Number(c.maxDiscount), c.usageLimit, c.oncePerCustomer]).toEqual(['percent', 12, 400, 3, true]);
  expect(c.endsAt.getTime() - c.startsAt.getTime()).toBe(day); // today only, the whole day

  await db.coupon.update({ where: { code }, data: { used: 2 } });
  await page.reload();
  await page.getByRole('button', { name: `แก้ไข ${code}` }).click();
  await dlg.locator('#cp-usageLimit').fill('1');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg.locator('.err')).toContainText('ใช้ไปแล้ว 2 ครั้ง');
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click();

  await page.getByRole('button', { name: `ปิดใช้ ${code}` }).click();
  await expect(page.getByRole('button', { name: `เปิดใช้ ${code}` })).toBeVisible();
  await expect(row.locator('.tag')).toHaveText('ปิดใช้');
  expect(await db.auditLog.count({ where: { cat: 'coupon', target: code } })).toBe(2);
});

test('sales report adds up: revenue, gross profit and best sellers', async ({ page, browser }) => {
  const sku = await product(1070, 5); // cost 535 → profit per unit 1,000 − 535 = 465
  await paidOrder(page, { [sku]: 2 }, 'นนทบุรี');
  const mg = await (await browser.newContext()).newPage();
  await loginAs(mg, USERS.manager);
  await mg.goto('/sales?p=90d');

  const since = new Date(Date.now() - 92 * day);
  const sold = await db.order.findMany({ where: { status: { in: ['paid', 'packing', 'shipped', 'completed'] }, paidAt: { gte: since } }, include: { lines: { include: { item: true } } } });
  const revenue = sold.reduce((a, o) => a + Number(o.total), 0);
  const profit = sold.reduce((a, o) => a + (Number(o.subtotal) - Number(o.discount)) / 1.07 - o.lines.reduce((s, l) => s + Number(l.cost ?? l.item.cost) * l.qty, 0), 0);
  await expect(mg.getByTestId('sales-kpis')).toContainText('฿' + Math.round(revenue).toLocaleString('th-TH'));
  const shown = Number((await mg.getByTestId('gross-profit').innerText()).replace(/[฿,]/g, ''));
  expect(Math.abs(shown - profit)).toBeLessThan(0.02);
  // The new product's row: 2 sold, ฿2,140 sales, ฿930 profit
  await mg.goto('/sales?p=7d');
  const row = mg.getByRole('region', { name: 'สินค้าขายดี' }).locator('tr', { hasText: sku });
  await expect(row).toContainText('฿2,140.00');
  await expect(row).toContainText('฿930.00');
});

for (const [user, coupons, sales] of [[USERS.manager, true, true], [USERS.admin, true, true], [USERS.executive, false, true], [USERS.storekeeper, false, false]] as const) {
  test(`${user}: coupons ${coupons ? 'yes' : 'no'}, sales report ${sales ? 'yes' : 'no'}`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto('/coupons');
    if (coupons) await expect(page).toHaveURL(/\/coupons$/); else await expect(page).not.toHaveURL(/\/coupons/);
    await page.goto('/sales');
    if (sales) await expect(page).toHaveURL(/\/sales$/); else await expect(page).not.toHaveURL(/\/sales/);
  });
}
