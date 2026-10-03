import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// "แจ้งปัญหา": the Asset Tag is checked against the register as you type. Only type and model are shown
// (never someone else's name), and an unknown tag warns but doesn't block the report.
const P = 'E2E-ACK';
test.afterAll(async () => { await db.ticket.deleteMany({ where: { title: { startsWith: P } } }); });

test('own device, someone else\'s device, unknown tag', async ({ page }) => {
  await loginAs(page, USERS.employee);
  await page.goto('/tickets/new');
  const me = await db.user.findUniqueOrThrow({ where: { username: USERS.employee } });
  const mine = await db.asset.findFirstOrThrow({ where: { holderId: me.empId! } });
  const other = await db.asset.findFirstOrThrow({ where: { holderId: { not: null, notIn: [me.empId!] }, NOT: { tag: { startsWith: 'E2E' } } }, include: { holder: true } });
  const field = page.locator('#nt-asset'), check = page.locator('[aria-live="polite"]').filter({ hasText: /✓|ไม่พบ/ });

  await field.fill(mine.tag.toLowerCase());                      // case doesn't matter
  await expect(check).toContainText(`✓ ${mine.type} · ${mine.model} — เครื่องที่คุณถือครอง`);

  await field.fill(other.tag);
  await expect(check).toContainText(`✓ ${other.type} · ${other.model}`);
  await expect(check).not.toContainText('เครื่องที่คุณถือครอง');
  await expect(check).not.toContainText(other.holder!.name);     // the register's holders stay private

  await field.fill('zz-9999');
  await expect(check).toContainText('ไม่พบ ZZ-9999 ในทะเบียนทรัพย์สิน');

  // still allowed to send; the tag is stored the way the register writes tags
  await page.locator('#nt-title').fill(`${P} เครื่องไม่มีในทะเบียน`);
  await page.locator('#nt-desc').fill('ทดสอบ');
  await page.getByRole('button', { name: /ส่งเรื่องแจ้งซ่อม/ }).click();
  await expect.poll(async () => (await db.ticket.findFirst({ where: { title: { startsWith: P } } }))?.assetTag).toBe('ZZ-9999');
});
