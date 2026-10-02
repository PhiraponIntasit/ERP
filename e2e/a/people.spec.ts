import { test, expect } from '@playwright/test';
import { db, USERS } from '../helpers';
import { as } from './util';

// Employees & assets: CRUD, hand-over / return, registration, and auto-return when an employee is deleted.
const NAME = `E2E พนักงาน ${Date.now() % 1e6}`, TAG = `E2E-${Date.now() % 1e6}`;

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await db.asset.deleteMany({ where: { tag: { startsWith: 'E2E-' } } });
  await db.employee.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
});

test('add and edit an employee', async ({ browser }) => {
  const page = await as(browser, USERS.itsupport);
  await page.goto('/employees');
  await page.getByRole('button', { name: '+ เพิ่มพนักงาน' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.locator('#e-name').fill(NAME);
  await dlg.locator('#e-position').fill('Tester');
  await dlg.locator('#e-dept').selectOption('HR');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg).toBeHidden();
  const row = page.locator('tr', { hasText: NAME });
  await expect(row).toContainText('HR');

  await row.getByRole('button', { name: 'แก้ไข' }).click();
  dlg = page.getByRole('dialog');
  await dlg.locator('#e-position').fill('Senior Tester');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(row).toContainText('Senior Tester');
  const log = await db.auditLog.findFirstOrThrow({ where: { action: 'แก้ไขข้อมูลพนักงาน', target: { contains: NAME } } });
  expect(log.detail).toContain('ตำแหน่ง: Tester → Senior Tester');
});

test('register an asset, hand it over, and one holder per tag', async ({ browser }) => {
  const page = await as(browser, USERS.itsupport);
  await page.goto('/assets');
  await page.getByRole('button', { name: '+ ลงทะเบียนอุปกรณ์' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#na-tag').fill(TAG.toLowerCase());          // stored upper-case
  await dlg.locator('#na-model').fill('ThinkPad E14');
  await dlg.locator('#na-warranty').fill('2030-01-31');
  await dlg.getByRole('button', { name: 'บันทึก' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('tr', { hasText: TAG })).toContainText('ว่าง · คลัง IT');

  await page.goto('/employees');
  await page.locator('tr', { hasText: NAME }).getByRole('button', { name: /อุปกรณ์/ }).click();
  const a = page.getByRole('dialog');
  await a.getByRole('button', { name: new RegExp(TAG) }).click();     // pick from free assets
  await a.getByRole('button', { name: 'ส่งมอบ' }).click();
  await expect(a.getByRole('button', { name: 'คืนอุปกรณ์' })).toHaveCount(1);
  const emp = await db.employee.findFirstOrThrow({ where: { name: NAME } });
  expect((await db.asset.findUniqueOrThrow({ where: { tag: TAG } })).holderId).toBe(emp.id);

  // the same tag can't be handed to a second person
  await page.goto('/employees');
  await page.locator('tr', { hasText: 'ณัฐธิดา' }).getByRole('button', { name: /อุปกรณ์/ }).click();
  const b = page.getByRole('dialog');
  await b.locator('#h-tag').fill(TAG);
  await b.getByRole('button', { name: 'ส่งมอบ' }).click();
  await expect(b).toContainText('ถูกถือครองโดย');
});

test('deleting an employee returns their devices to IT storage', async ({ browser }) => {
  const page = await as(browser, USERS.itsupport);
  await page.goto('/employees');
  await page.locator('tr', { hasText: NAME }).getByRole('button', { name: 'ลบ' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('รับคืนเข้าคลัง IT อัตโนมัติ');
  await dlg.getByRole('button', { name: 'ลบ' }).click();
  await expect(page.locator('tr', { hasText: NAME })).toHaveCount(0);
  const asset = await db.asset.findUniqueOrThrow({ where: { tag: TAG }, include: { history: true } });
  expect(asset.holderId).toBeNull();
  expect(asset.history.map(h => h.text).join()).toContain('รับคืนอัตโนมัติ');
});
