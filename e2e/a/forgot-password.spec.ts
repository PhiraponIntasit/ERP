import { test, expect, type Browser } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { db, loginAs } from '../helpers';

// "ลืมรหัสผ่าน": request page + one-time reset link. CI has no mail server, so the emailed link is
// replaced by a reset row the test creates with a known token (the app only stores its sha256).
const P = 'e2e-fp', NAME = 'E2E ลืมรหัส', OLD = 'oldpass123';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let username = '', userId = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  username = `${P}${Date.now() % 1e6}`;
  userId = (await db.user.create({ data: { username, name: NAME, role: 'itsupport', perms: ['claims'], email: `${username}@e2e.test`, dept: 'HR', passwordHash: await bcrypt.hash(OLD, 10) } })).id;
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { username: { startsWith: P } } });   // reset rows cascade
});

async function request(browser: Browser, ident: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/forgot-password');
  await page.fill('#ident', ident);
  await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
  const msg = await page.getByRole('status').textContent();
  await page.context().close();
  return msg;
}
async function makeLink(expiresInMin = 30) {
  const token = randomBytes(32).toString('base64url');
  await db.passwordReset.create({ data: { id: sha(token), userId, expiresAt: new Date(Date.now() + expiresInMin * 6e4) } });
  return `/reset-password?token=${token}`;
}

test('login page links to the forgot-password form', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'ลืมรหัสผ่าน?' }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
});

test('same reply for real and unknown accounts; only real ones get a link', async ({ browser }) => {
  const real = await request(browser, username), byEmail = await request(browser, `${username.toUpperCase()}@E2E.TEST`);
  const unknown = await request(browser, 'no-such-user-e2e');
  expect(real).toContain('ถ้าข้อมูลตรงกับบัญชี');
  expect(byEmail).toBe(real);
  expect(unknown).toBe(real);
  const rows = await db.passwordReset.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  expect(rows).toHaveLength(2);
  expect(rows.filter(r => !r.usedAt)).toHaveLength(1);       // a newer request invalidates the older link
});

test('at most 3 links per account per hour', async ({ browser }) => {
  await request(browser, username);                           // 3rd
  await request(browser, username);                           // 4th — refused silently
  expect(await db.passwordReset.count({ where: { userId } })).toBe(3);
  expect(await db.auditLog.count({ where: { target: username, action: 'ขอรีเซ็ตรหัสผ่านไม่สำเร็จ', detail: { contains: 'ขอเกิน 3 ครั้ง' } } })).toBe(1);
});

test('reset link: validation, success, single use, signs out everywhere', async ({ browser }) => {
  const signedIn = await (await browser.newContext()).newPage();
  await loginAs(signedIn, username, OLD);

  const link = await makeLink();
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await expect(page.getByText(`บัญชี: ${username}`)).toBeVisible();
  const err = page.locator('.err[role=alert]');
  await page.fill('#rp-new', 'short12'); await page.fill('#rp-cf', 'short12'); await page.click('button[type=submit]');
  await expect(err).toContainText('อย่างน้อย 8');
  await page.fill('#rp-new', 'newpass456'); await page.fill('#rp-cf', 'newpass457'); await page.click('button[type=submit]');
  await expect(err).toContainText('ไม่ตรงกัน');
  await page.fill('#rp-new', 'newpass456'); await page.fill('#rp-cf', 'newpass456'); await page.click('button[type=submit]');
  await expect(page.getByRole('status')).toContainText('ตั้งรหัสผ่านใหม่แล้ว');

  await page.goto(link);
  await expect(page.getByText('ลิงก์ใช้ไม่ได้')).toBeVisible();          // single use
  await signedIn.goto('/claims');
  await expect(signedIn).toHaveURL(/\/login/);                            // signed out everywhere
  await loginAs(signedIn, username, 'newpass456');
  await expect(signedIn).not.toHaveURL(/\/login/);
});

test('expired or bogus links are refused', async ({ page }) => {
  await page.goto(await makeLink(-1));
  await expect(page.getByText('ลิงก์ใช้ไม่ได้')).toBeVisible();
  await page.goto('/reset-password?token=not-a-real-token');
  await expect(page.getByText('ลิงก์ใช้ไม่ได้')).toBeVisible();
});
