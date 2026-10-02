import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { PNG } from './util';

// "แจ้งปัญหา" on a phone (Pixel 7 project — see playwright.config.ts).
const P = 'E2E-MOB';
test.afterAll(() => db.ticket.deleteMany({ where: { title: { startsWith: P } } }));

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('phone layout: fits the screen, big inputs, camera button, submit always reachable', async ({ page }) => {
  await loginAs(page, USERS.employee2);
  await page.goto('/tickets/new');
  expect(await overflowX(page)).toBeLessThanOrEqual(0);

  // 16px fields stop iOS from zooming in on focus
  expect(await page.locator('#nt-title').evaluate(e => getComputedStyle(e).fontSize)).toBe('16px');
  // touch devices get a camera button that opens the rear camera
  const camera = page.locator('input[aria-label="ถ่ายรูป"]');
  await expect(page.getByText('ถ่ายรูป', { exact: true })).toBeVisible();
  expect(await camera.getAttribute('capture')).toBe('environment');
  await expect(page.getByText('เลือกจากคลังภาพ')).toBeVisible();

  // the submit bar is on screen without scrolling, and stays there after scrolling
  const submit = page.getByRole('button', { name: /ส่งเรื่องแจ้งซ่อม/ });
  const inView = async () => { const b = (await submit.boundingBox())!; return b.y >= 0 && b.y + b.height <= page.viewportSize()!.height; };
  expect(await inView()).toBe(true);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await inView()).toBe(true);
});

test('report a problem from a phone', async ({ page }) => {
  const title = `${P} ${Date.now()}`;
  await loginAs(page, USERS.employee2);
  await page.goto('/tickets/new');

  const submit = page.getByRole('button', { name: /ส่งเรื่องแจ้งซ่อม/ });
  await submit.tap();
  await expect(page.getByRole('alert').filter({ hasText: 'กรุณากรอกหัวข้อ' })).toBeVisible(); // error shows next to the button

  await page.getByRole('button', { name: 'เครื่องพิมพ์' }).tap();
  await page.getByRole('button', { name: 'วิกฤต' }).tap();
  await expect(page.getByText('ภายใน 4 ชั่วโมง')).toBeVisible();          // SLA hint follows the urgency
  await page.fill('#nt-title', title);
  await page.fill('#nt-desc', 'พิมพ์ไม่ออก');
  await page.setInputFiles('input[aria-label="เลือกรูปภาพ"]', [{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByRole('button', { name: 'ลบรูป' })).toHaveCount(2);
  await expect(page.getByText('(2/6 รูป)')).toBeVisible();
  await submit.tap();

  await expect(page).toHaveURL(/\/tickets\/mine/);
  const t = await db.ticket.findFirstOrThrow({ where: { title }, include: { images: true } });
  expect([t.cat, t.urgency, t.images.length]).toEqual(['printer', 'critical', 2]);
  await expect(page.locator('.tcard', { hasText: t.id })).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});
