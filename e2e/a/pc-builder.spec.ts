import { test, expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../helpers';

// /build — pick parts slot by slot, see what doesn't fit, add the whole set to the cart, save it to the account.
// Uses the seed catalogue (prisma/seed-store.ts); compatibility rules themselves are unit-tested in compat.spec.ts.

const P = 'e2e-pcb-';
test.afterAll(async () => { await db.customer.deleteMany({ where: { email: { startsWith: P } } }); });

const slot = (page: Page, key: string) => page.locator(`[data-slot="${key}"]`);
const cand = (page: Page, sku: string) => page.locator(`[data-candidate="${sku}"]`);

async function choose(page: Page, key: string, sku: string) {
  const s = slot(page, key);
  await s.getByRole('link', { name: /^(เลือก|เปลี่ยน)/ }).first().click();
  await expect(page.getByRole('list', { name: /^ตัวเลือก/ })).toBeVisible();
  await cand(page, sku).getByRole('link', { name: /^เลือก / }).click();
  await expect(s.locator(`[data-sku="${sku}"]`)).toBeVisible();
}

async function signIn(page: Page) {
  const c = await db.customer.create({ data: { email: `${P}${Date.now()}@example.com`, passwordHash: '-', name: 'ทดสอบ จัดสเปค' } });
  const token = randomBytes(32).toString('base64url');
  await db.customerSession.create({ data: { id: createHash('sha256').update(token).digest('hex'), customerId: c.id, expiresAt: new Date(Date.now() + 864e5) } });
  await page.context().addCookies([{ name: 'cp_session', value: token, url: test.info().project.use.baseURL || process.env.E2E_BASE_URL || 'http://localhost:3000' }]);
  return c;
}

test('pick a full AM5 build; incompatible parts are explained and cannot be picked; add the set to the cart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'เมนูร้าน' }).getByRole('link', { name: 'จัดสเปคคอม' }).click();
  await expect(page).toHaveURL(/\/build$/);
  await expect(page.getByRole('button', { name: 'ใส่ตะกร้าทั้งชุด' })).toBeDisabled();

  await choose(page, 'cpu', 'CPU-R5-7600');
  // Intel boards are listed but not selectable, with the reason.
  await slot(page, 'mainboard').getByRole('link', { name: 'เลือกเมนบอร์ด' }).click();
  await expect(cand(page, 'MB-GB-B760M')).toContainText('ใช้ไม่ได้: CPU ใช้ Socket AM5 แต่เมนบอร์ดเป็น LGA1700');
  await expect(cand(page, 'MB-GB-B760M').getByRole('link', { name: /^เลือก / })).toHaveCount(0);
  await cand(page, 'MB-MSI-B650M').getByRole('link', { name: /^เลือก / }).click();
  await choose(page, 'case', 'CASE-CM-Q300L');

  // RAM: DDR4 and notebook SODIMM are refused.
  await slot(page, 'ram').getByRole('link', { name: 'เลือกแรม' }).click();
  await expect(cand(page, 'RAM-CR-16D4')).toContainText('เมนบอร์ดรองรับแรม DDR5 แต่เลือกแรม DDR4');
  await expect(cand(page, 'RAM-16D5')).toContainText('SODIMM');
  await cand(page, 'RAM-KF-32D5').getByRole('link', { name: /^เลือก / }).click();

  await choose(page, 'ssd', 'SSD-WD-SN850X');
  await choose(page, 'vga', 'VGA-GB-4060');
  await choose(page, 'psu', 'PSU-CM-650B');
  await choose(page, 'cooler', 'COOL-DC-AK400');

  const total = 6990 + 5790 + 1490 + 3690 + 3290 + 10990 + 2090 + 1190;
  await expect(page.getByTestId('build-total')).toHaveText(`฿${total.toLocaleString('en-US')}.00`);
  await expect(page.getByTestId('build-power')).toContainText('ประเมินการใช้ไฟ 280 W · แนะนำพาวเวอร์ 400 W');
  await expect(page.getByRole('status')).toHaveText('ชิ้นส่วนครบและเข้ากันได้ทั้งชุด');
  // The URL holds the whole build, so it can be shared.
  for (const sku of ['CPU-R5-7600', 'MB-MSI-B650M', 'RAM-KF-32D5', 'CASE-CM-Q300L']) expect(page.url()).toContain(sku);

  await page.getByRole('button', { name: 'ใส่ตะกร้าทั้งชุด' }).click();
  await expect(page.getByText('เพิ่มชุดสเปค 8 ชิ้นลงตะกร้าแล้ว')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ตะกร้าสินค้า 8 ชิ้น' })).toBeVisible();
  await page.goto('/cart');
  for (const sku of ['CPU-R5-7600', 'VGA-GB-4060', 'COOL-DC-AK400']) await expect(page.locator(`[data-sku="${sku}"]`).first()).toBeVisible();
});

test('a build that does not fit shows the problems and cannot go to the cart', async ({ page }) => {
  await page.goto('/build?cpu=CPU-I5-14400F&mainboard=MB-TUF-B650&case=CASE-CM-Q300L&psu=PSU-CM-650B');
  const issues = page.getByRole('list', { name: 'ข้อควรแก้' });
  await expect(issues).toContainText('ใช้ร่วมกันไม่ได้: CPU ใช้ Socket LGA1700 แต่เมนบอร์ดเป็น AM5');
  await expect(issues).toContainText('เมนบอร์ดขนาด ATX ใส่เคสนี้ไม่ได้');
  await expect(issues).toContainText('CPU นี้ไม่มีกราฟิกในตัว');
  await expect(slot(page, 'vga')).toHaveClass(/slotErr/);
  await expect(page.getByText('ยังขาด: แรม, SSD')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ใส่ตะกร้าทั้งชุด' })).toBeDisabled();

  // Unknown SKUs and parts placed in the wrong slot are ignored.
  await page.goto('/build?cpu=NOPE-123&ram=CPU-R5-7600&ssd=SSD-WD-SN850X');
  await expect(slot(page, 'cpu').getByRole('link', { name: 'เลือกCPU' })).toBeVisible();
  await expect(slot(page, 'ram').getByRole('link', { name: 'เลือกแรม' })).toBeVisible();
  await expect(slot(page, 'ssd').locator('[data-sku="SSD-WD-SN850X"]')).toBeVisible();
});

test('signed-out visitors are asked to sign in to save; a customer saves, reopens and deletes a build', async ({ page }) => {
  const url = '/build?cpu=CPU-R5-7600&mainboard=MB-MSI-B650M&ram=RAM-KF-32D5';
  await page.goto(url);
  await expect(page.getByRole('link', { name: 'เข้าสู่ระบบเพื่อบันทึกสเปค' })).toHaveAttribute('href', /next=%2Fbuild%3Fcpu%3DCPU-R5-7600/);

  await signIn(page);
  await page.goto(url);
  await page.getByLabel('ชื่อสเปค').fill('คอมทำงาน AM5');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('บันทึก “คอมทำงาน AM5” แล้ว')).toBeVisible();

  await page.goto('/account');
  await page.getByRole('link', { name: 'ดูสเปคที่บันทึกไว้' }).click();
  const card = page.locator('[data-build="คอมทำงาน AM5"]');
  await expect(card).toContainText('CPU: AMD Ryzen 5 7600');
  await expect(card).toContainText('฿16,470.00');
  await card.getByRole('link', { name: 'เปิดสเปคนี้' }).click();
  await expect(slot(page, 'mainboard').locator('[data-sku="MB-MSI-B650M"]')).toBeVisible();

  await page.goto('/account/builds');
  page.once('dialog', d => d.accept());
  await card.getByRole('button', { name: 'ลบ' }).click();
  await expect(page.getByText('ยังไม่มีสเปคที่บันทึกไว้')).toBeVisible();
});
