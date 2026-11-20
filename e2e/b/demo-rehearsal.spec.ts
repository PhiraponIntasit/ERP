import { test, expect, type Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { db } from '../helpers';
import { cleanupShop, customer, product, stamp } from './shop';

// The presentation, rehearsed end to end in ONE browser tab, the way it is shown to the committee
// (docs/DEMO.md): a visitor searches the storefront → product page → cart → signs in → checkout with a coupon →
// pays the PromptPay QR (demo) → store keeper packs and ships with a serial → customer sees the parcel and the
// receipt, confirms → manager sees it in the sales report → the customer files a warranty claim and the shop
// swaps the unit → the Audit Log tells the whole story.
// Record it as a video for the slides:  DEMO_VIDEO=1 npx playwright test e2e/b/demo-rehearsal.spec.ts
const VIDEO = !!process.env.DEMO_VIDEO;
test.use({ video: VIDEO ? { mode: 'on', size: { width: 1280, height: 800 } } : 'off', viewport: { width: 1280, height: 800 } });
const codes: string[] = [], claimed: string[] = [];
test.afterAll(async () => {
  await db.claim.deleteMany({ where: { serial: { in: claimed } } });
  await cleanupShop();
  await db.coupon.deleteMany({ where: { code: { in: codes } } });
});

const beat = (page: Page, ms = 2000) => (VIDEO ? page.waitForTimeout(ms * 1.5) : Promise.resolve());
/** Staff sign-in in the same tab: the customer's storefront cookie stays, only the staff session changes. */
async function staff(page: Page, username: string) {
  await page.context().clearCookies({ name: 'erp_session' });
  await page.goto('/login');
  await page.fill('#u', username);
  await page.fill('#p', '1234');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.press('#p', 'Enter')]);
}

test('demo shop entry signs in the sample customer with a ready cart', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /เดโมหน้าร้าน/ }).click();
  await page.getByRole('button', { name: 'เข้าหน้าร้านในฐานะลูกค้าตัวอย่าง' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator('#co-name')).toHaveValue('มานี ใจดี');
  await expect(page.getByRole('complementary', { name: 'สรุปคำสั่งซื้อ' })).toContainText('AMD Ryzen 5 7600 × 1');
  // leave the demo customer as found
  await db.cartItem.deleteMany({ where: { cart: { customerId: 'cus-demo' } } });
  await db.customerSession.deleteMany({ where: { customerId: 'cus-demo' } });
});

test('rehearsal: storefront → cart → sign in → order → QR payment → pack & ship → receipt → report → claim → audit', async ({ page }) => {
  test.setTimeout(VIDEO ? 300_000 : 120_000);
  const s = stamp().toUpperCase(), serials = [`DEMO-${s}-1`, `DEMO-${s}-2`];
  claimed.push(...serials);
  const name = `AMD Ryzen 7 7700 สาธิต ${s}`;
  const cpu = await product(6990, 2, serials, name);
  const cat = await db.category.findUnique({ where: { slug: 'cpu' } });
  await db.inventoryItem.update({ where: { sku: cpu }, data: { warrantyMonths: 36, slug: cpu.toLowerCase(), categoryId: cat?.id } });
  const code = `DEMO${s}`.slice(0, 20);
  codes.push(code);
  await db.coupon.create({ data: { code, kind: 'percent', value: 10, maxDiscount: 500, startsAt: new Date(Date.now() - 864e5), endsAt: new Date(Date.now() + 864e5) } });
  // A customer account with a password, signed out: the demo signs in through the storefront like a real customer.
  const c = await customer(page, {});
  await db.customer.update({ where: { id: c.id }, data: { name: 'มานี ใจดี', passwordHash: await bcrypt.hash('1234', 10) } });
  await page.context().clearCookies({ name: 'cp_session' });

  // 1 · Visitor (person A's storefront): search → product page → buy now → cart → sign in → checkout
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).fill(s);
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).press('Enter');
  await expect(page).toHaveURL(/\/shop\?q=/);
  await page.getByRole('link', { name }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await beat(page);
  await page.getByRole('button', { name: 'ซื้อเลย' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await beat(page);
  await page.getByRole('link', { name: 'เข้าสู่ระบบเพื่อสั่งซื้อ' }).click();
  await page.fill('#cl-email', c.email);
  await page.fill('#cl-password', '1234');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // 2 · Checkout with a coupon (6,990 − 10% capped at 500 → 6,490, Chiang Mai, free shipping ≥ 2,000)
  await page.fill('#co-name', 'มานี ใจดี'); await page.fill('#co-phone', '0899999999');
  await page.fill('#co-line1', '99/1 ถนนนิมมานเหมินท์'); await page.fill('#co-subdistrict', 'สุเทพ'); await page.fill('#co-district', 'เมืองเชียงใหม่');
  await page.selectOption('#co-province', 'เชียงใหม่'); await page.fill('#co-postcode', '50200');
  await beat(page);
  await page.getByLabel('โค้ดส่วนลด').fill(code);
  await page.getByRole('button', { name: 'ใช้คูปอง' }).click();
  await expect(page.getByTestId('discount')).toHaveText('−฿500.00');
  await expect(page.getByTestId('grand')).toHaveText('฿6,490.00');
  await beat(page);
  await page.getByRole('button', { name: 'สั่งซื้อและชำระด้วย PromptPay' }).click();

  // 3 · PromptPay QR for exactly the total, then the simulated bank transfer → paid on its own
  await expect(page).toHaveURL(/\/pay\/ORD-/);
  const id = decodeURIComponent(page.url().split('/pay/')[1]);
  await expect(page.getByRole('img', { name: 'QR PromptPay ยอด ฿6,490.00' })).toBeVisible();
  await beat(page, 3500);
  await page.getByRole('button', { name: 'จำลองการโอนเงิน (เดโม)' }).click();
  await expect(page.getByRole('heading', { name: 'ชำระเงินสำเร็จ' })).toBeVisible();
  await beat(page, 3000);

  // 4 · Store keeper: pack, scan the serial, ship
  await staff(page, 'wiphada');
  await page.goto('/orders');
  await page.locator('tr', { hasText: id }).getByRole('link', { name: id }).click();
  await beat(page);
  await page.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await page.locator(`#sn-${cpu}`).fill(serials[0]);
  await page.locator('#sh-carrier').selectOption('Kerry Express');
  await page.locator('#sh-track').fill('KEX0000123456');
  await beat(page);
  await page.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('จัดส่งแล้ว');
  await beat(page, 3000);

  // 5 · Customer: parcel number, receipt with VAT, confirm receipt
  await page.goto(`/pay/${id}`);
  await expect(page.getByText('พัสดุ: Kerry Express · KEX0000123456')).toBeVisible();
  await page.getByRole('button', { name: 'ใบเสร็จ PDF' }).click();
  await expect(page.locator('#receipt-print').getByTestId('receipt-total')).toHaveText('฿6,490.00');
  await expect(page.locator('#receipt-print')).toContainText('−฿500.00');
  await beat(page, 3500);
  await page.getByRole('button', { name: 'ปิด' }).click();
  await page.getByRole('button', { name: 'ได้รับสินค้าแล้ว' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('สำเร็จ');
  await beat(page);

  // 6 · Manager: the sale is in today's report, with its profit
  await staff(page, 'manager');
  await page.goto('/sales?p=7d');
  const row = page.getByRole('region', { name: 'สินค้าขายดี' }).locator('tr', { hasText: cpu });
  await expect(row).toContainText('฿6,990.00');
  await row.scrollIntoViewIfNeeded();
  await beat(page, 3500);

  // 7 · Warranty: the customer reports the unit faulty (A's claim form) → store keeper receives it and swaps it
  await page.goto('/account/claims/new');
  await page.getByRole('radio', { name: new RegExp(serials[0]) }).check();
  await page.getByLabel('อาการเสีย').fill('จอฟ้าหลังใช้งาน 2 สัปดาห์ เปิดเครื่องใหม่แล้วยังเป็น');
  await beat(page);
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page).toHaveURL(/\/account\/claims\?new=CLM-/);
  const claimId = new URL(page.url()).searchParams.get('new')!;
  await beat(page);
  await staff(page, 'wiphada');
  await page.goto('/claims');
  await page.locator(`tr[data-claim="${claimId}"]`).getByRole('link', { name: claimId }).click();
  await expect(page.getByTestId('warranty-until')).toContainText('อยู่ในประกัน');
  await page.getByRole('button', { name: 'รับเครื่องแล้ว' }).click();
  await expect(page.getByTestId('claim-status')).toHaveText('ร้านได้รับเครื่อง · กำลังตรวจสอบ');
  await page.getByLabel('Serial เครื่องใหม่').fill(serials[1]);
  await beat(page);
  await page.getByRole('button', { name: 'อนุมัติและเปลี่ยนเครื่อง' }).click();
  await expect(page.getByTestId('claim-status')).toHaveText('เปลี่ยนเครื่องใหม่แล้ว');
  await page.goto(`/warranty?q=${serials[1]}`);
  await expect(page.getByTestId('serial-status')).toHaveText('ขายแล้ว');
  await beat(page);

  // 8 · Audit Log (manager): every step, who did it, in order
  await staff(page, 'manager');
  await page.goto(`/audit?q=${id}`);
  for (const a of ['สั่งซื้อ', 'ชำระเงินสำเร็จ · ตัดสต็อก', 'เริ่มแพ็กสินค้า', 'จัดส่งสินค้า', 'ลูกค้ายืนยันรับสินค้า', 'ลูกค้าแจ้งเคลม', 'เปลี่ยนสินค้าตามประกัน'])
    await expect(page.locator('tbody')).toContainText(a);
  await beat(page, 4000);
});
