import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// "งานที่ได้รับมอบหมาย" on a phone (Pixel 7 project). Uses its own tickets (E2E-WRK…) assigned to the
// seeded technician and restores any stock it withdraws.
const P = 'E2E-WRK';
const PART = 'KB-K380';
let stockBefore = 0, newId = '', waitId = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  stockBefore = (await db.inventoryItem.findUniqueOrThrow({ where: { sku: PART } })).qty;
  const [tech, req] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } }),
    db.user.findUniqueOrThrow({ where: { username: USERS.employee } }),   // has a phone number on file
  ]);
  const n = Date.now() % 100000;
  newId = `${P}${n}A`; waitId = `${P}${n}B`;
  await db.ticket.createMany({ data: [
    { id: newId, title: `${P} คีย์บอร์ดกดไม่ติด`, cat: 'peripheral', urgency: 'high', desc: 'ปุ่ม Enter ค้าง', requesterId: req.id, assigneeId: tech.id, status: 'assigned' },
    { id: waitId, title: `${P} รอแบต`, cat: 'laptop', urgency: 'low', desc: '-', requesterId: req.id, assigneeId: tech.id, status: 'waiting' },
  ] });
});
test.afterAll(async () => {
  const parts = await db.ticketPart.findMany({ where: { ticketId: { startsWith: P } } });
  for (const p of parts) await db.inventoryItem.update({ where: { sku: p.sku }, data: { qty: { increment: p.qty } } });
  await db.stockMove.deleteMany({ where: { ref: { startsWith: P } } });
  await db.ticket.deleteMany({ where: { id: { startsWith: P } } });
});

test('fits the screen; filters narrow the list; requester can be called', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/work');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  const card = page.locator('.tcard', { hasText: newId });
  const phone = (await db.user.findUniqueOrThrow({ where: { username: USERS.employee }, include: { employee: true } })).employee!.phone;
  await expect(card.getByRole('link', { name: /โทรหา/ })).toHaveAttribute('href', `tel:${phone.replace(/[^\d+]/g, '')}`);

  await page.getByRole('button', { name: /^รออะไหล่/ }).tap();
  await expect(page.locator('.tcard', { hasText: waitId })).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: /^งานใหม่/ }).tap();
  await expect(card).toBeVisible();
  await expect(page.locator('.tcard', { hasText: waitId })).toHaveCount(0);
});

test('one-tap status buttons with a note', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/work');
  const card = page.locator('.tcard', { hasText: newId });
  await expect(card.getByRole('radio', { name: /มอบหมายแล้ว/ })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('radio', { name: /มอบหมายแล้ว/ })).toContainText('ตอนนี้');

  await card.getByRole('radio', { name: 'กำลังทำ' }).tap();
  await card.getByLabel('บันทึกการทำงาน').fill('ถอดปุ่มทำความสะอาด');
  await card.getByRole('button', { name: 'อัปเดตสถานะ' }).tap();
  await expect(card.getByRole('radio', { name: /กำลังทำ/ })).toContainText('ตอนนี้');
  const t = await db.ticket.findUniqueOrThrow({ where: { id: newId }, include: { history: true } });
  expect(t.status).toBe('progress');
  expect(t.history.map(h => h.text).join()).toContain('ถอดปุ่มทำความสะอาด');

  await card.locator('summary', { hasText: 'ประวัติการดำเนินงาน' }).tap();
  await expect(card).toContainText('อัปเดตสถานะ: กำลังดำเนินการ — ถอดปุ่มทำความสะอาด');
});

test('withdraw parts with the −/+ stepper', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/work');
  const card = page.locator('.tcard', { hasText: newId });
  await card.getByRole('button', { name: /เบิกอะไหล่/ }).tap();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#w-sku').selectOption(PART);
  await expect(dlg).toContainText(`คงเหลือในคลัง ${stockBefore}`);
  await expect(dlg.getByRole('button', { name: 'ลดจำนวน' })).toBeDisabled();       // can't go below 1
  await dlg.getByRole('button', { name: 'เพิ่มจำนวน' }).tap();
  await expect(dlg.locator('#w-qty')).toHaveValue('2');
  await expect(dlg).toContainText(`หลังเบิกเหลือ ${stockBefore - 2}`);
  expect(await dlg.locator('#w-qty').evaluate(e => getComputedStyle(e).fontSize)).toBe('16px');
  await dlg.getByRole('button', { name: /ยืนยันเบิก/ }).tap();
  await expect(dlg).toBeHidden();
  await expect(card).toContainText('Logitech K380 Keyboard × 2');
  expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku: PART } })).qty).toBe(stockBefore - 2);
});
