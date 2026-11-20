import { test, expect, type Page } from '@playwright/test';
import { db, loginAs } from '../helpers';
import { as, dropUsers, makeUser } from './util';

// Self-service password change, on a throwaway account so the seeded demo passwords never change.
const P = 'e2e-pw';
test.afterAll(() => dropUsers(P));

async function submit(page: Page, current: string, next: string, confirm: string) {
  const dlg = page.getByRole('dialog');
  await dlg.locator('#cp-cur').fill(current);
  await dlg.locator('#cp-new').fill(next);
  await dlg.locator('#cp-cf').fill(confirm);
  await dlg.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
  return dlg;
}

test('change own password: validation, other devices signed out, new password works', async ({ browser }) => {
  const username = `${P}${Date.now() % 1e6}`, OLD = 'oldpass123', NEW = 'newpass456';
  await makeUser(username, OLD);
  const here = await as(browser, username, OLD), elsewhere = await as(browser, username, OLD);

  await here.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
  await expect(await submit(here, 'wrong', NEW, NEW)).toContainText('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  await expect(await submit(here, OLD, NEW, NEW + 'x')).toContainText('ไม่ตรงกัน');
  await expect(await submit(here, OLD, OLD, OLD)).toContainText('ไม่ซ้ำกับรหัสผ่านเดิม');
  await expect(await submit(here, OLD, 'short12', 'short12')).toContainText('อย่างน้อย 8');
  const dlg = await submit(here, OLD, NEW, NEW);
  await expect(dlg).toBeHidden();
  await expect(here.locator('.toast')).toContainText('เปลี่ยนรหัสผ่านแล้ว');

  await here.goto('/claims');
  await expect(here).toHaveURL(/\/claims/);                   // this device stays signed in
  await elsewhere.goto('/claims');
  await expect(elsewhere).toHaveURL(/\/login/);               // other devices are signed out

  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto('/login');
  await fresh.fill('#u', username); await fresh.fill('#p', OLD); await fresh.press('#p', 'Enter');
  await expect(fresh.locator('form [role=alert]')).toContainText('ไม่ถูกต้อง');
  await loginAs(fresh, username, NEW);
  await expect(fresh).not.toHaveURL(/\/login/);

  const logs = await db.auditLog.findMany({ where: { target: username, cat: 'user' } });
  expect(logs.map(l => l.action)).toEqual(expect.arrayContaining(['เปลี่ยนรหัสผ่าน', 'เปลี่ยนรหัสผ่านไม่สำเร็จ']));
});
