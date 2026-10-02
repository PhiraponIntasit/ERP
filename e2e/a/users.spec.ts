import { test, expect } from '@playwright/test';
import { db, USERS } from '../helpers';
import { as, dropUsers, makeUser } from './util';

const P = 'e2e-u';
test.afterAll(() => dropUsers(P));

test('admin creates an account: 8-character minimum, unique username', async ({ browser }) => {
  const page = await as(browser, USERS.admin);
  await page.goto('/users');
  await page.getByRole('button', { name: '+ สร้างบัญชีผู้ใช้' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.locator('#nu-p')).toHaveValue(''); // no pre-filled password
  await dlg.locator('#nu-name').fill('ผู้ใช้ทดสอบ');
  await dlg.locator('#nu-u').fill(USERS.employee2);
  await dlg.locator('#nu-p').fill('longenough1');
  await dlg.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(dlg).toContainText('Username นี้ถูกใช้แล้ว');

  const username = `${P}${Date.now() % 1e6}`;
  await dlg.locator('#nu-u').fill(username);
  await dlg.locator('#nu-p').fill('1234567');
  await dlg.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(dlg).toContainText('อย่างน้อย 8');

  await dlg.locator('#nu-p').fill('12345678');
  await dlg.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(dlg).toBeHidden();
  const u = await db.user.findUniqueOrThrow({ where: { username } });
  expect([u.role, u.active]).toEqual(['employee', true]);
});

test('admin cannot remove their own user-management permission', async ({ browser }) => {
  const page = await as(browser, USERS.admin);
  await page.goto('/users');
  await page.locator('tr', { hasText: 'Admin' }).filter({ hasText: USERS.admin }).first().getByRole('button', { name: 'กำหนดสิทธิ์' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('.perm-row', { hasText: 'บัญชีผู้ใช้ & สิทธิ์' }).locator('input').uncheck();
  await dlg.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
  await expect(dlg).toContainText('ไม่สามารถถอดสิทธิ์จัดการผู้ใช้ของตัวเองได้');
});

test('suspending an account signs it out immediately; re-enabling restores access', async ({ browser }) => {
  const username = `${P}s${Date.now() % 1e6}`;
  await makeUser(username, 'password123');
  const victim = await as(browser, username, 'password123');

  const admin = await as(browser, USERS.admin);
  await admin.goto('/users');
  const row = admin.locator('tr', { hasText: username });
  await row.getByRole('button', { name: 'ระงับ' }).click();
  await expect(row).toContainText('ระงับ');

  await victim.goto('/tickets/mine');
  await expect(victim).toHaveURL(/\/login/);
  await victim.fill('#u', username); await victim.fill('#p', 'password123'); await victim.press('#p', 'Enter');
  await expect(victim.locator('form [role=alert]')).toContainText('ถูกระงับ');

  await row.getByRole('button', { name: 'เปิดใช้' }).click();
  await expect(row).toContainText('ใช้งาน');
  expect((await db.user.findUniqueOrThrow({ where: { username } })).active).toBe(true);
});
