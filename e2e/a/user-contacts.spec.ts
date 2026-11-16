import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { dropUsers } from './util';

// Staff contact details now live on the account itself (the employee directory was removed):
// email for notifications and password resets, phone for technicians, department for ticket cards.
const P = 'e2e-uc';

test.describe.configure({ mode: 'serial' });
test.afterAll(() => dropUsers(P));

test('create an account with its work email, phone and department', async ({ page }) => {
  const username = `${P}${Date.now() % 1e6}`;
  await loginAs(page, USERS.admin);
  await page.goto('/users');
  await page.getByRole('button', { name: '+ สร้างบัญชีผู้ใช้' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#nu-name').fill('ทดสอบ ติดต่อ');
  await dlg.locator('#nu-u').fill(username);
  await dlg.locator('#nu-p').fill('e2e-pass-1234');
  await dlg.locator('#nu-email').fill('not-an-email');
  await dlg.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(dlg.locator('.err')).toContainText('อีเมลไม่ถูกต้อง');

  await dlg.locator('#nu-email').fill(`${username}@corepick.test`);
  await dlg.locator('#nu-phone').fill('081-234-5678');
  await dlg.locator('#nu-dept').fill('Sales');
  await dlg.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(dlg).toBeHidden();
  const u = await db.user.findUniqueOrThrow({ where: { username } });
  expect([u.email, u.phone, u.dept]).toEqual([`${username}@corepick.test`, '081-234-5678', 'Sales']);
  await expect(page.locator('tr', { hasText: username })).toContainText(`Sales · ${username}@corepick.test`);
});

test('edit contact details in "กำหนดสิทธิ์"; the change is audited before → after', async ({ page }) => {
  const u = await db.user.findFirstOrThrow({ where: { username: { startsWith: P } } });
  await loginAs(page, USERS.admin);
  await page.goto('/users');
  await page.locator('tr', { hasText: u.username }).getByRole('button', { name: 'กำหนดสิทธิ์' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#pm-phone').fill('089-999-0000');
  await dlg.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
  await expect(dlg).toBeHidden();
  expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe('089-999-0000');
  const log = await db.auditLog.findFirstOrThrow({ where: { target: u.username, action: 'แก้ไขสิทธิ์ผู้ใช้' }, orderBy: { t: 'desc' } });
  expect(log.detail).toContain('โทร 081-234-5678 → 089-999-0000');
});

test('the employee directory and asset register are gone', async ({ page }) => {
  await loginAs(page, USERS.admin);
  for (const path of ['/employees', '/assets']) expect((await page.goto(path))?.status()).toBe(404);
  await page.goto('/dashboard');
  await expect(page.locator('nav')).toContainText('บัญชีผู้ใช้ & สิทธิ์');
  await expect(page.locator('nav')).not.toContainText(/ทะเบียนทรัพย์สิน|ข้อมูลพนักงาน/);
});
