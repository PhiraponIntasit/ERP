import { test, expect, type Page } from '@playwright/test';
import { db } from '../helpers';
import { cleanupShop, customer, product, stamp } from './shop';

// The presentation, rehearsed end to end in ONE browser tab, the way it is shown to the committee
// (docs/DEMO.md): customer orders with a coupon → pays the PromptPay QR (demo) → store keeper packs and ships
// with a serial → customer sees the parcel and the receipt, confirms → manager sees it in the sales report →
// a warranty swap by serial → the Audit Log tells the whole story.
// Record it as a video for the slides:  DEMO_VIDEO=1 npx playwright test e2e/b/demo-rehearsal.spec.ts
const VIDEO = !!process.env.DEMO_VIDEO;
test.use({ video: VIDEO ? { mode: 'on', size: { width: 1280, height: 800 } } : 'off', viewport: { width: 1280, height: 800 } });
test.afterAll(cleanupShop);
const codes: string[] = [];
test.afterAll(async () => { await db.coupon.deleteMany({ where: { code: { in: codes } } }); });

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

test('rehearsal: order → QR payment → pack & ship → receipt → report → warranty → audit', async ({ page }) => {
  test.setTimeout(VIDEO ? 240_000 : 90_000);
  const s = stamp().toUpperCase(), serials = [`DEMO-${s}-1`, `DEMO-${s}-2`];
  const cpu = await product(6990, 2, serials, 'AMD Ryzen 7 7700 (สินค้าสาธิต)');
  const code = `DEMO${s}`.slice(0, 20);
  codes.push(code);
  await db.coupon.create({ data: { code, kind: 'percent', value: 10, maxDiscount: 500, startsAt: new Date(Date.now() - 864e5), endsAt: new Date(Date.now() + 864e5) } });
  await customer(page, { [cpu]: 1 });

  // 1 · Customer: checkout with a coupon (6,990 − 10% capped at 500 → 6,490, Chiang Mai, free shipping ≥ 2,000)
  await page.goto('/checkout');
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

  // 2 · PromptPay QR for exactly the total, then the simulated bank transfer → paid on its own
  await expect(page).toHaveURL(/\/pay\/ORD-/);
  const id = decodeURIComponent(page.url().split('/pay/')[1]);
  await expect(page.getByRole('img', { name: 'QR PromptPay ยอด ฿6,490.00' })).toBeVisible();
  await beat(page, 3500);
  await page.getByRole('button', { name: 'จำลองการโอนเงิน (เดโม)' }).click();
  await expect(page.getByRole('heading', { name: 'ชำระเงินสำเร็จ' })).toBeVisible();
  await beat(page, 3000);

  // 3 · Store keeper: pack, scan the serial, ship
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

  // 4 · Customer: parcel number, receipt with VAT, confirm receipt
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

  // 5 · Manager: the sale is in today's report, with its profit
  await staff(page, 'manager');
  await page.goto('/sales?p=7d');
  const row = page.getByRole('region', { name: 'สินค้าขายดี' }).locator('tr', { hasText: cpu });
  await expect(row).toContainText('฿6,990.00');
  await row.scrollIntoViewIfNeeded();
  await beat(page, 3500);

  // 6 · Warranty: the unit comes back faulty → swap by serial
  await page.goto(`/warranty?q=${serials[0]}`);
  await expect(page.getByTestId('warranty')).toContainText('อยู่ในประกันถึง');
  await page.locator('#w-new').fill(serials[1]);
  await page.locator('#w-note').fill('จอฟ้าหลังใช้งาน 2 สัปดาห์');
  await beat(page);
  await page.getByRole('button', { name: 'ยืนยันเปลี่ยนเครื่อง' }).click();
  await expect(page).toHaveURL(new RegExp(`q=${serials[1]}$`)); // now showing the replacement unit
  await expect(page.getByTestId('serial-status')).toHaveText('ขายแล้ว');
  await beat(page);

  // 7 · Audit Log: every step, who did it, in order
  await page.goto(`/audit?q=${id}`);
  for (const a of ['สั่งซื้อ', 'ชำระเงินสำเร็จ · ตัดสต็อก', 'เริ่มแพ็กสินค้า', 'จัดส่งสินค้า', 'ลูกค้ายืนยันรับสินค้า', 'เปลี่ยนสินค้าตามประกัน'])
    await expect(page.locator('tbody')).toContainText(a);
  await beat(page, 4000);
});
