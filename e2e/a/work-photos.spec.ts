import { test, expect } from '@playwright/test';
import { db, USERS } from '../helpers';
import { as, dropUsers, makeUser, PNG } from './util';

// Technicians attach photos when updating a job (e.g. before / after the repair). The photos are tied to
// the history entry, shown apart from the requester's photos, and private like every ticket photo.
const P = 'e2e-wp', T = 'E2E-WPH', PW = 'e2e-pass-1234';
const id = `${T}${Date.now() % 100000}`;
let tech = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const u = await makeUser(`${P}${Date.now() % 100000}`, PW, 'itsupport', ['ticket_new', 'my_tickets', 'tickets_work', 'inventory']);
  tech = u.username;
  const req = await db.user.findUniqueOrThrow({ where: { username: USERS.employee } });
  await db.ticket.create({ data: { id, title: `${T} จอกระพริบ`, cat: 'monitor', urgency: 'medium', desc: '-', requesterId: req.id, assigneeId: u.id, status: 'progress' } });
});
test.afterAll(async () => {
  await db.ticket.deleteMany({ where: { id: { startsWith: T } } });
  await dropUsers(P);
});

const pick = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: PNG }));

test('attach photos on their own, then with "แก้ไขเสร็จ" and a note', async ({ browser }) => {
  const page = await as(browser, tech, PW);
  await page.goto('/work');
  const card = page.locator('.tcard', { hasText: id });
  const input = card.locator('input[aria-label="แนบรูปการทำงาน"]');

  await input.setInputFiles(pick(2));
  await expect(card.getByRole('button', { name: /^ลบรูปที่/ })).toHaveCount(2);
  await card.getByRole('button', { name: 'ลบรูปที่ 1' }).click();
  await expect(card.getByRole('button', { name: /^ลบรูปที่/ })).toHaveCount(1);

  // photos alone are a valid update (status and note unchanged)
  await card.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
  await expect(card.getByRole('group', { name: 'รูปจากช่าง' })).toContainText('รูปจากช่าง (1)');
  await expect(card.getByRole('button', { name: /^ลบรูปที่/ })).toHaveCount(0);   // picker cleared

  await input.setInputFiles(pick(1));
  await card.getByRole('radio', { name: 'แก้ไขเสร็จ' }).click();
  await card.getByLabel('บันทึกการทำงาน').fill('เปลี่ยนสายจอแล้ว');
  await card.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
  await expect(card.getByRole('group', { name: 'รูปจากช่าง' })).toContainText('รูปจากช่าง (2)');

  await card.locator('summary', { hasText: 'ประวัติการดำเนินงาน' }).click();
  await expect(card).toContainText('แนบรูปการทำงาน 1 รูป');
  await expect(card).toContainText('อัปเดตสถานะ: แก้ไขเสร็จ · รอยืนยัน — เปลี่ยนสายจอแล้ว · แนบรูป 1 รูป');

  const imgs = await db.ticketImage.findMany({ where: { ticketId: id }, include: { event: true } });
  expect(imgs.map(i => i.kind)).toEqual(['work', 'work']);
  expect(imgs.every(i => !!i.event)).toBe(true);
  expect(new Set(imgs.map(i => i.eventId)).size).toBe(2);                 // one history entry per update
  expect((await db.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('resolved');
});

test('the requester sees the technician\'s photos; other employees can\'t open them', async ({ browser }) => {
  const img = await db.ticketImage.findFirstOrThrow({ where: { ticketId: id, kind: 'work' } });

  const requester = await as(browser, USERS.employee);
  await requester.goto('/tickets/mine');
  await expect(requester.locator('.tcard', { hasText: id }).getByRole('group', { name: 'รูปจากช่าง' })).toContainText('รูปจากช่าง (2)');
  expect((await requester.request.get(`/api/files/${img.id}`)).status()).toBe(200);

  const other = await as(browser, USERS.employee2);
  expect((await other.request.get(`/api/files/${img.id}`)).status()).toBe(404);
});
