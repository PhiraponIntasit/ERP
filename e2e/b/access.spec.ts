import { test, expect } from '@playwright/test';
import { loginAs, USERS } from '../helpers';

// Who can open B's menus (ROLE_PERMS in src/lib/domain.ts). Pages without permission redirect to the user's home.
const cases: [string, string, boolean][] = [
  [USERS.storekeeper, '/inventory', true],
  [USERS.storekeeper, '/purchase', true],
  [USERS.storekeeper, '/approvals', false],
  [USERS.itsupport, '/inventory', true],
  [USERS.itsupport, '/purchase', false],
  [USERS.manager, '/approvals', true],
  [USERS.manager, '/dashboard', true],
  [USERS.manager, '/audit', true],
  [USERS.manager, '/inventory', false],
  [USERS.employee, '/dashboard', false],
  [USERS.employee, '/audit', false],
];

for (const [user, path, allowed] of cases) {
  test(`${user} ${allowed ? 'can' : 'cannot'} open ${path}`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto(path);
    if (allowed) await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
    else await expect(page).not.toHaveURL(new RegExp(`${path}(\\?|$)`));
  });
}

test('IT Support sees inventory read-only', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/inventory');
  await expect(page.getByPlaceholder('ค้นหาชื่อสินค้า, SKU, หมวด')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ สินค้าใหม่' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'รับสินค้าเข้า / เพิ่มสต็อก' })).toHaveCount(0);
});

test('signed-out visitors are sent to login', async ({ page }) => {
  for (const path of ['/inventory', '/purchase', '/approvals', '/dashboard', '/audit']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  expect((await page.request.get('/api/audit')).status()).not.toBe(200);
});
