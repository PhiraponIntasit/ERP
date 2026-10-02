import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers';

test('desktop shows the full menu without a menu button', async ({ page }) => {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/inventory');
  await expect(page.getByRole('link', { name: /ใบขอซื้อ \/ ใบสั่งซื้อ/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeHidden();
});
