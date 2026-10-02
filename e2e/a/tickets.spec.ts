import { test, expect } from '@playwright/test';
import { db, USERS } from '../helpers';
import { as, PNG } from './util';

// Full repair-ticket lifecycle across four roles: report with photo → assign → withdraw parts → resolve → confirm with rating.
const TITLE = `E2E-TCK ${Date.now()}`;
const PART = 'HDMI-2M';
let tid = '', stockBefore = 0;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => { stockBefore = (await db.inventoryItem.findUniqueOrThrow({ where: { sku: PART } })).qty; });
test.afterAll(async () => {
  // put stock back and remove everything this test created
  const ts = await db.ticket.findMany({ where: { title: { startsWith: 'E2E-TCK' } }, include: { parts: true } });
  for (const t of ts) {
    for (const p of t.parts) await db.inventoryItem.update({ where: { sku: p.sku }, data: { qty: { increment: p.qty } } });
    await db.stockMove.deleteMany({ where: { ref: t.id } });
  }
  await db.ticket.deleteMany({ where: { title: { startsWith: 'E2E-TCK' } } });
});

test('employee reports a problem with a photo', async ({ browser }) => {
  const page = await as(browser, USERS.employee2);
  await page.goto('/tickets/new');
  await page.getByRole('button', { name: 'จอภาพ' }).click();
  await page.getByRole('button', { name: 'สูง', exact: true }).click();
  await page.fill('#nt-title', TITLE);
  await page.fill('#nt-desc', 'จอกระพริบเป็นระยะ');
  await page.setInputFiles('input[aria-label="เลือกรูปภาพ"]', { name: 'screen.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('button', { name: 'ลบรูป' })).toHaveCount(1);
  await page.getByRole('button', { name: 'ส่งเรื่องแจ้งซ่อม' }).click();
  await expect(page).toHaveURL(/\/tickets\/mine/);

  const t = await db.ticket.findFirstOrThrow({ where: { title: TITLE }, include: { images: true } });
  tid = t.id;
  expect([t.status, t.cat, t.urgency, t.images.length]).toEqual(['new', 'monitor', 'high', 1]);
  expect(t.images[0].mime).toBe('image/jpeg'); // resized and re-encoded in the browser
  await expect(page.locator('.tcard', { hasText: tid })).toContainText('รอมอบหมาย');
});

test('ticket photos are visible only to people involved', async ({ browser }) => {
  const img = await db.ticketImage.findFirstOrThrow({ where: { ticketId: tid } });
  const url = `/api/files/${img.id}`;
  expect((await (await as(browser, USERS.employee2)).request.get(url)).status()).toBe(200); // requester
  expect((await (await as(browser, USERS.itmanager)).request.get(url)).status()).toBe(200); // dispatcher
  expect((await (await as(browser, USERS.employee)).request.get(url)).status()).toBe(404);  // someone else
});

test('IT Manager assigns the ticket', async ({ browser }) => {
  const page = await as(browser, USERS.itmanager);
  await page.goto('/dispatch');
  const card = page.locator('.tcard', { hasText: tid });
  const tech = await db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } });
  await card.getByLabel('เลือกช่าง').selectOption(tech.id);
  await card.getByRole('button', { name: 'มอบหมายงาน' }).click();
  await expect(card).toContainText('ผู้รับผิดชอบ: สมชาย สายชล');
  expect((await db.ticket.findUniqueOrThrow({ where: { id: tid } })).status).toBe('assigned');
});

test('IT Support withdraws a part and resolves', async ({ browser }) => {
  const page = await as(browser, USERS.itsupport);
  await page.goto('/work');
  const card = page.locator('.tcard', { hasText: tid });

  await card.getByRole('button', { name: /เบิกอะไหล่/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#w-sku').selectOption(PART);
  await dlg.locator('#w-qty').fill('9999');
  await dlg.getByRole('button', { name: /ยืนยันเบิก/ }).click();
  await expect(dlg).toContainText('สต็อกไม่พอ');
  expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku: PART } })).qty).toBe(stockBefore);

  await dlg.locator('#w-qty').fill('1');
  await dlg.getByRole('button', { name: /ยืนยันเบิก/ }).click();
  await expect(dlg).toBeHidden();
  await expect(card).toContainText('HDMI 2.1 Cable 2m × 1');
  expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku: PART } })).qty).toBe(stockBefore - 1);
  expect(await db.stockMove.count({ where: { ref: tid, type: 'out', qty: 1 } })).toBe(1);

  await card.getByRole('radio', { name: 'แก้ไขเสร็จ' }).click();
  await card.getByLabel('บันทึกการทำงาน').fill('เปลี่ยนสายแล้ว');
  await card.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
  await expect(card).toContainText('แก้ไขเสร็จ · รอยืนยัน');
});

test('other technicians cannot see the ticket', async ({ browser }) => {
  const page = await as(browser, USERS.itsupport2);
  await page.goto('/work');
  await expect(page.locator('.tcard', { hasText: tid })).toHaveCount(0);
});

test('requester confirms with a rating', async ({ browser }) => {
  const page = await as(browser, USERS.employee2);
  await page.goto('/tickets/mine');
  const card = page.locator('.tcard', { hasText: tid });
  await card.getByRole('button', { name: 'ยืนยันปิดงาน' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'ยืนยันปิดงาน' }).click();
  await expect(dlg).toContainText('กรุณาให้คะแนน');
  await dlg.getByRole('radio', { name: '4 ดาว' }).click();
  await dlg.getByRole('button', { name: 'ยืนยันปิดงาน' }).click();
  await expect(dlg).toBeHidden();
  await expect(card).toContainText('ปิดงาน');
  const t = await db.ticket.findUniqueOrThrow({ where: { id: tid } });
  expect([t.status, t.rating]).toEqual(['closed', 4]);
});

test('"ยังไม่หาย" sends a resolved ticket back to the technician', async ({ browser }) => {
  const me = await db.user.findUniqueOrThrow({ where: { username: USERS.employee2 } });
  const tech = await db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } });
  const id = `TCK-E2E${Date.now() % 100000}`;
  await db.ticket.create({ data: { id, title: `E2E-TCK reopen ${Date.now()}`, cat: 'software', urgency: 'low', desc: '-', requesterId: me.id, assigneeId: tech.id, status: 'resolved', resolvedAt: new Date() } });
  const page = await as(browser, USERS.employee2);
  await page.goto('/tickets/mine');
  await page.locator('.tcard', { hasText: id }).getByRole('button', { name: 'ยังไม่หาย' }).click();
  await expect(page.locator('.tcard', { hasText: id })).toContainText('กำลังดำเนินการ');
  expect((await db.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('progress');
});
