import { test, expect } from '@playwright/test';
import { loginAs, USERS } from '../helpers';

test('audit log filters by search text and exports CSV', async ({ page }) => {
  await loginAs(page, USERS.manager);
  await page.goto('/audit');
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();

  await page.getByLabel('ค้นหา Audit Log').fill('เข้าสู่ระบบไม่สำเร็จ');
  await expect(page).toHaveURL(/q=/);
  await expect(rows.first()).toContainText('เข้าสู่ระบบไม่สำเร็จ');
  for (const r of await rows.all()) await expect(r).toContainText('เข้าสู่ระบบไม่สำเร็จ');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Export CSV/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
});
