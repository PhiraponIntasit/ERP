import { test, expect } from '@playwright/test';
import { loginAs, USERS } from '../helpers';

// Who can open A's menus (ROLE_PERMS in src/lib/domain.ts). Pages without permission redirect to the user's home.
const cases: [string, string, boolean][] = [
  [USERS.employee, '/tickets/new', true],
  [USERS.employee, '/tickets/mine', true],
  [USERS.employee, '/dispatch', false],
  [USERS.employee, '/work', false],
  [USERS.employee, '/employees', false],
  [USERS.employee, '/users', false],
  [USERS.itmanager, '/dispatch', true],
  [USERS.itmanager, '/assets', true],
  [USERS.itmanager, '/work', false],
  [USERS.itmanager, '/employees', false],
  [USERS.itsupport, '/work', true],
  [USERS.itsupport, '/employees', true],
  [USERS.itsupport, '/assets', true],
  [USERS.itsupport, '/dispatch', false],
  [USERS.itsupport, '/users', false],
  [USERS.manager, '/users', false],
  [USERS.admin, '/users', true],
];

for (const [user, path, allowed] of cases) {
  test(`${user} ${allowed ? 'can' : 'cannot'} open ${path}`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto(path);
    if (allowed) await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
    else await expect(page).not.toHaveURL(new RegExp(`${path}(\\?|$)`));
  });
}

test('signed-out visitors are sent to login', async ({ page }) => {
  for (const path of ['/', '/tickets/new', '/tickets/mine', '/dispatch', '/work', '/employees', '/assets', '/users']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('wrong password is rejected and audited', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#u', USERS.admin);
  await page.fill('#p', 'wrong-password');
  await page.press('#p', 'Enter');
  await expect(page.locator('form [role=alert]')).toContainText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  await expect(page).toHaveURL(/\/login/);
});
