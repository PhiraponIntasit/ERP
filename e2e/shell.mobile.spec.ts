import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers';

// App shell on a phone (shared: src/components/shell.tsx)
test('menu is collapsed behind a button, opens on tap and closes after navigating', async ({ page }) => {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/inventory');
  const menuLink = page.getByRole('link', { name: /ใบขอซื้อ \/ ใบสั่งซื้อ/ });
  await expect(menuLink).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport(); // page content starts on the first screen

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await expect(menuLink).toBeVisible();
  await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();

  await menuLink.click();
  await expect(page).toHaveURL(/\/purchase/);
  await expect(menuLink).toBeHidden();
  await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeVisible();
});

test('menu bar stays on screen while scrolling', async ({ page }) => {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/inventory');
  await page.mouse.wheel(0, 2000);
  await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeInViewport();
});
