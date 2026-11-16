import { test, expect } from '@playwright/test';
import { db, USERS } from '../helpers';
import { as, dropUsers, makeUser } from './util';

// Rules that must agree across menus:
//  1. only people who can actually work a job (IT Support, active, holding "งานที่ได้รับมอบหมาย") can be assigned one
//  2. suspending / un-permitting a technician who still has jobs is flagged for reassignment
//  3. no part withdrawals once a job is reported fixed
const P = 'e2e-c', T = 'E2E-CON', PW = 'e2e-pass-1234';
const n = Date.now() % 100000;
const ids = { perm: `${T}${n}A`, susp: `${T}${n}B`, done: `${T}${n}C` };
let lose = { id: '', username: '', name: '' }, susp = { ...lose }, worker = { ...lose };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const tech = ['ticket_new', 'my_tickets', 'tickets_work', 'inventory'];   // IT Support defaults
  [lose, susp, worker] = await Promise.all(['lose', 'susp', 'work'].map(k => makeUser(`${P}-${k}${n}`, PW, 'itsupport', tech)));
  const req = await db.user.findUniqueOrThrow({ where: { username: USERS.employee } });
  await db.ticket.createMany({ data: [
    { id: ids.perm, title: `${T} ช่างถูกถอดสิทธิ์`, cat: 'software', urgency: 'low', desc: '-', requesterId: req.id, assigneeId: lose.id, status: 'progress' },
    { id: ids.susp, title: `${T} ช่างถูกระงับ`, cat: 'software', urgency: 'low', desc: '-', requesterId: req.id, assigneeId: susp.id, status: 'assigned' },
    { id: ids.done, title: `${T} แจ้งเสร็จแล้ว`, cat: 'software', urgency: 'low', desc: '-', requesterId: req.id, assigneeId: worker.id, status: 'resolved', resolvedAt: new Date() },
  ] });
});
test.afterAll(async () => {
  await db.ticket.deleteMany({ where: { id: { startsWith: T } } });
  await dropUsers(P);
});

test('taking away "งานที่ได้รับมอบหมาย" warns about the jobs still assigned', async ({ browser }) => {
  const page = await as(browser, USERS.admin);
  await page.goto('/users');
  await page.locator('tr', { hasText: lose.username }).getByRole('button', { name: 'กำหนดสิทธิ์' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('checkbox', { name: 'งานที่ได้รับมอบหมาย' }).uncheck();
  await dlg.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
  await expect(page.locator('.toast', { hasText: 'ยังมีงานค้าง 1 งาน' })).toBeVisible();
});

test('suspending a technician warns about the jobs still assigned', async ({ browser }) => {
  const page = await as(browser, USERS.admin);
  await page.goto('/users');
  await page.locator('tr', { hasText: susp.username }).getByRole('button', { name: 'ระงับ' }).click();
  await expect(page.locator('.toast', { hasText: 'ยังมีงานซ่อมค้าง 1 งาน' })).toBeVisible();
});

test('dispatch: those jobs are flagged, the people are not offered, reassigning clears the flag', async ({ browser }) => {
  const page = await as(browser, USERS.itmanager);
  await page.goto('/dispatch');
  const a = page.locator('.tcard', { hasText: ids.perm }), b = page.locator('.tcard', { hasText: ids.susp });
  await expect(a).toContainText('ช่างไม่มีสิทธิ์รับงานแล้ว');
  await expect(b).toContainText('บัญชีช่างถูกระงับ');
  const offered = await a.getByLabel('เลือกช่าง').locator('option').allTextContents();
  for (const u of [lose, susp]) expect(offered.join('|')).not.toContain(u.name);

  await page.getByRole('button', { name: /^ต้องมอบหมายใหม่/ }).click();
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  await expect(page.locator('.tcard', { hasText: ids.done })).toHaveCount(0);

  await page.getByRole('button', { name: 'การแจ้งเตือน' }).click();
  await expect(page.getByText(/งานค้างกับช่างที่รับงานไม่ได้แล้ว \d+ งาน/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^ทั้งหมด/ }).click();

  const tech = await db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } });
  await a.getByLabel('เลือกช่าง').selectOption(tech.id);
  await a.getByRole('button', { name: 'เปลี่ยนผู้รับผิดชอบ' }).click();
  await expect(a).toContainText(`ผู้รับผิดชอบ: ${tech.name}`);
  await expect(a).not.toContainText('ช่างไม่มีสิทธิ์รับงานแล้ว');
});

test('no part withdrawals once the job is reported fixed', async ({ browser }) => {
  const page = await as(browser, worker.username, PW);
  await page.goto('/work');
  const card = page.locator('.tcard', { hasText: ids.done });
  await expect(card).toContainText('เปลี่ยนเป็น “กำลังทำ” เพื่อเบิกเพิ่ม');
  await expect(card.getByRole('button', { name: /เบิกอะไหล่/ })).toHaveCount(0);

  // back to "in progress" → withdrawals are offered again
  await card.getByRole('radio', { name: /กำลังทำ/ }).click();
  await card.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
  await expect(card.getByRole('button', { name: /เบิกอะไหล่/ })).toBeVisible();
});
