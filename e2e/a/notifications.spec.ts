import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { db, USERS } from '../helpers';
import { as } from './util';

// Email notifications across the ticket lifecycle. Without SMTP the app writes each email to the outbox
// folder (MAIL_OUTBOX_DIR, default ./storage/outbox outside production) — this test reads them from there.
const OUTBOX = path.resolve(process.env.MAIL_OUTBOX_DIR || './storage/outbox');
const P = 'E2E-NTF';
type Mail = { to: string; subject: string; text: string; file: string };
const seen: string[] = [];

function mailsFor(id: string): Mail[] {
  let files: string[] = [];
  try { files = readdirSync(OUTBOX).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.map(f => ({ ...JSON.parse(readFileSync(path.join(OUTBOX, f), 'utf8')), file: f }) as Mail).filter(m => m.subject.includes(id));
}
/** Waits for exactly `n` emails about ticket `id` whose subject contains `about` (they're sent just after the response). */
async function expectMails(id: string, about: string, n: number) {
  let got: Mail[] = [];
  await expect.poll(() => (got = mailsFor(id).filter(m => m.subject.includes(about))).length, { timeout: 10_000 }).toBe(n);
  seen.push(...got.map(m => m.file));
  return got;
}
const emailOf = async (username: string) => (await db.user.findUniqueOrThrow({ where: { username }, include: { employee: true } })).employee!.email;

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await db.ticket.deleteMany({ where: { title: { startsWith: P } } });
  for (const f of seen) rmSync(path.join(OUTBOX, f), { force: true });
});

async function report(page: Page, title: string) {
  await page.goto('/tickets/new');
  await page.fill('#nt-title', title);
  await page.fill('#nt-desc', 'ทดสอบอีเมลแจ้งเตือน');
  await page.getByRole('button', { name: /ส่งเรื่องแจ้งซ่อม/ }).click();
  await expect(page).toHaveURL(/\/tickets\/mine/);
  return (await db.ticket.findFirstOrThrow({ where: { title } })).id;
}

test('the whole ticket lifecycle emails the right person at each step', async ({ browser }) => {
  const [requester, manager, admin, tech] = await Promise.all([USERS.employee2, USERS.itmanager, USERS.admin, USERS.itsupport].map(emailOf));
  const emp = await as(browser, USERS.employee2);
  const id = await report(emp, `${P} ${Date.now()}`);

  // 1. new ticket → every dispatcher (IT Manager + Admin), not the requester
  const created = await expectMails(id, 'คำร้องใหม่', 2);
  expect(created.map(m => m.to).sort()).toEqual([admin, manager].sort());
  expect(created[0].text).toContain('/dispatch');

  // 2. assigned → the technician
  const mgr = await as(browser, USERS.itmanager);
  await mgr.goto('/dispatch');
  const dcard = mgr.locator('.tcard', { hasText: id });
  await dcard.getByLabel('เลือกช่าง').selectOption((await db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } })).id);
  await dcard.getByRole('button', { name: 'มอบหมายงาน' }).click();
  const assigned = await expectMails(id, 'ได้รับมอบหมายงาน', 1);
  expect(assigned[0].to).toBe(tech);
  expect(assigned[0].text).toContain('/work');

  // 3. resolved → the requester, with the technician's note
  const t = await as(browser, USERS.itsupport);
  const resolve = async (note: string) => {
    await t.goto('/work');
    const card = t.locator('.tcard', { hasText: id });
    await card.getByRole('radio', { name: /แก้ไขเสร็จ/ }).click();
    await card.getByLabel('บันทึกการทำงาน').fill(note);
    await card.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(card.getByRole('radio', { name: /แก้ไขเสร็จ/ })).toContainText('ตอนนี้');
  };
  await resolve('เปลี่ยนสาย LAN แล้ว');
  const resolved = await expectMails(id, 'ซ่อมเสร็จแล้ว', 1);
  expect(resolved[0].to).toBe(requester);
  expect(resolved[0].text).toContain('เปลี่ยนสาย LAN แล้ว');

  // 4. "ยังไม่หาย" → the technician
  await emp.goto('/tickets/mine');
  await emp.locator('.tcard', { hasText: id }).getByRole('button', { name: 'ยังไม่หาย' }).click();
  expect((await expectMails(id, 'ยังไม่หาย', 1))[0].to).toBe(tech);

  // 5. resolved again, then confirmed with a rating → the technician gets the score
  await resolve('เปลี่ยนการ์ดแลนแล้ว');
  await expectMails(id, 'ซ่อมเสร็จแล้ว', 2);
  await emp.goto('/tickets/mine');
  await emp.locator('.tcard', { hasText: id }).getByRole('button', { name: 'ยืนยันปิดงาน' }).click();
  const dlg = emp.getByRole('dialog');
  await dlg.getByRole('radio', { name: '5 ดาว' }).click();
  await dlg.getByRole('button', { name: 'ยืนยันปิดงาน' }).click();
  const closed = await expectMails(id, 'ปิดงานแล้ว', 1);
  expect(closed[0].to).toBe(tech);
  expect(closed[0].subject).toContain('5/5');
});

test("the person who acted isn't emailed about their own action", async ({ browser }) => {
  // Admin is a dispatcher too, so reporting a ticket themselves should only email the IT Manager
  const id = await report(await as(browser, USERS.admin), `${P} self ${Date.now()}`);
  const mails = await expectMails(id, 'คำร้องใหม่', 1);
  expect(mails[0].to).toBe(await emailOf(USERS.itmanager));
});
