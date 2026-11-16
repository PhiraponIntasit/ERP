import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// "ศูนย์มอบหมายงาน" on a phone (Pixel 7 project). Uses its own tickets (E2E-DSP…) and deletes them afterwards.
const P = 'E2E-DSP';
let lateId = '', freshId = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const req = await db.user.findUniqueOrThrow({ where: { username: USERS.employee } });   // has a phone number on file
  const n = Date.now() % 100000;
  lateId = `${P}${n}A`; freshId = `${P}${n}B`;
  await db.ticket.createMany({ data: [
    // critical = 4 h SLA, opened 6 h ago → overdue
    { id: lateId, title: `${P} เซิร์ฟเวอร์ไฟล์ล่ม`, cat: 'network', urgency: 'critical', desc: 'เข้าไดรฟ์กลางไม่ได้', requesterId: req.id, status: 'new', created: new Date(Date.now() - 6 * 36e5) },
    { id: freshId, title: `${P} เมาส์ดับเบิลคลิก`, cat: 'peripheral', urgency: 'low', desc: '-', requesterId: req.id, status: 'new' },
  ] });
});
test.afterAll(async () => {
  await db.ticket.deleteMany({ where: { id: { startsWith: P } } });
});

test('fits the screen; SLA number and filters narrow the list; requester can be called', async ({ page }) => {
  await loginAs(page, USERS.itmanager);
  await page.goto('/dispatch');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  const late = page.locator('.tcard', { hasText: lateId }), fresh = page.locator('.tcard', { hasText: freshId });
  const phone = (await db.user.findUniqueOrThrow({ where: { username: USERS.employee } })).phone;
  await expect(late.getByRole('link', { name: /โทรหา/ })).toHaveAttribute('href', `tel:${phone.replace(/[^\d+]/g, '')}`);

  // the "เกิน SLA" number at the top is a shortcut to that list; tapping again shows everything
  const stat = page.locator('.stat-strip').getByRole('button', { name: /เกิน SLA/ });
  await stat.tap();
  await expect(stat).toHaveAttribute('aria-pressed', 'true');
  await expect(late).toBeVisible();
  await expect(fresh).toHaveCount(0);
  await stat.tap();
  await expect(fresh).toBeVisible();

  await page.getByRole('group', { name: 'กรองตามสถานะ' }).getByRole('button', { name: /^ปิดแล้ว/ }).tap();
  await expect(late).toHaveCount(0);
  await page.getByRole('group', { name: 'กรองตามสถานะ' }).getByRole('button', { name: /^รอมอบหมาย/ }).tap();
  await expect(late).toBeVisible();
  await expect(fresh).toBeVisible();
});

test('assign from the phone: full-width picker with 16px text, then reassign', async ({ page }) => {
  await loginAs(page, USERS.itmanager);
  await page.goto('/dispatch');
  const card = page.locator('.tcard', { hasText: lateId });
  const pick = card.getByLabel('เลือกช่าง');
  const [cardBox, pickBox] = [await card.boundingBox(), await pick.boundingBox()];
  expect(pickBox!.width).toBeGreaterThan(cardBox!.width * 0.8);
  expect(await pick.evaluate(e => getComputedStyle(e).fontSize)).toBe('16px');
  expect((await card.getByRole('button', { name: 'มอบหมายงาน' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const [tech, tech2] = await Promise.all([USERS.itsupport, USERS.itsupport2].map(u => db.user.findUniqueOrThrow({ where: { username: u } })));
  await pick.selectOption(tech.id);
  await card.getByRole('button', { name: 'มอบหมายงาน' }).tap();
  await expect(card).toContainText(`ผู้รับผิดชอบ: ${tech.name}`);
  expect((await db.ticket.findUniqueOrThrow({ where: { id: lateId } })).status).toBe('assigned');

  await pick.selectOption(tech2.id);
  await card.getByRole('button', { name: 'เปลี่ยนผู้รับผิดชอบ' }).tap();
  await expect(card).toContainText(`ผู้รับผิดชอบ: ${tech2.name}`);
  expect((await db.ticket.findUniqueOrThrow({ where: { id: lateId } })).assigneeId).toBe(tech2.id);
  await card.locator('summary', { hasText: 'ประวัติการดำเนินงาน' }).tap();
  await expect(card).toContainText(`มอบหมายให้ ${tech2.name}`);
});
