import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// พนักงาน / ทรัพย์สิน / ผู้ใช้ on a phone (Pixel 7 project): table rows turn into cards.
// Read-only: opens dialogs and cancels them, nothing is saved.

async function looksLikeCards(page: Page, rowText: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.locator('table').first().locator('thead')).toBeHidden();
  const row = page.locator('tr', { hasText: rowText }).first();
  expect(await row.evaluate(e => getComputedStyle(e).display)).toBe('grid');
  // every action button is a comfortable tap target (44px; boxes can come back as 43.9999 while the page animates in)
  for (const b of await row.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  return row;
}

test.beforeEach(async ({ page }) => { await loginAs(page, USERS.admin); });

test('employees: cards, department filters scroll, phone link, one-column form', async ({ page }) => {
  await page.goto('/employees');
  const emp = await db.employee.findFirstOrThrow({ where: { phone: { not: '' }, NOT: { name: { startsWith: 'e2e', mode: 'insensitive' } } }, orderBy: { id: 'asc' } });
  const row = await looksLikeCards(page, emp.name);
  await expect(row.getByRole('link', { name: emp.phone })).toHaveAttribute('href', `tel:${emp.phone.replace(/[^\d+]/g, '')}`);
  expect(await page.getByLabel('ค้นหาพนักงาน').evaluate(e => getComputedStyle(e).fontSize)).toBe('16px');

  const chips = page.getByRole('group', { name: 'กรองตามแผนก' });
  expect(await chips.evaluate(e => getComputedStyle(e).overflowX)).toBe('auto');
  await chips.getByRole('button', { name: /^IT/ }).tap();
  await expect(page.locator('tbody tr').first()).toContainText('IT');

  await page.getByRole('button', { name: '+ เพิ่มพนักงาน' }).tap();
  // both boxes in the same frame: the dialog scales in, so two separate reads can catch different sizes
  const [name, pos] = await page.evaluate(() => ['e-name', 'e-position'].map(id => document.getElementById(id)!.getBoundingClientRect().toJSON()));
  expect(pos.y).toBeGreaterThan(name.y);             // stacked, not side by side
  expect(Math.abs(pos.width - name.width)).toBeLessThan(2);
  await page.getByRole('button', { name: 'ยกเลิก' }).tap();
});

test('assets: cards with labelled lines and a full-width history button', async ({ page }) => {
  await page.goto('/assets');
  const a = await db.asset.findFirstOrThrow({ where: { NOT: { tag: { startsWith: 'e2e', mode: 'insensitive' } } }, orderBy: { tag: 'asc' } });
  const row = await looksLikeCards(page, a.tag);
  await expect(row.locator('td[data-label="ผู้ถือครอง"]')).toBeVisible();
  await row.getByRole('button', { name: 'ประวัติ' }).tap();
  await expect(page.getByRole('dialog')).toContainText('ประวัติการถือครอง');
  await page.getByRole('dialog').getByRole('button', { name: 'ปิด' }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('users: cards; the role matrix scrolls with the menu column pinned', async ({ page }) => {
  await page.goto('/users');
  const row = await looksLikeCards(page, USERS.itmanager);
  await expect(row.locator('td[data-label="Username"]')).toContainText(USERS.itmanager);
  const matrix = page.locator('table').nth(1);
  await expect(matrix.locator('thead')).toBeVisible();
  expect(await matrix.locator('td').first().evaluate(e => getComputedStyle(e).position)).toBe('sticky');
});
