import { test, expect } from '@playwright/test';
import { db, expectPagerText, loginAs, pager, USERS } from '../helpers';

const TAG = 'E2E-PAGE';

test.describe('stock-move history pagination', () => {
  let base = 0;
  test.beforeAll(async () => {
    await db.stockMove.deleteMany({ where: { ref: { startsWith: TAG } } });
    base = await db.stockMove.count();
    const item = await db.inventoryItem.findFirstOrThrow();
    // 25 moves, all older than the seeded ones, so they land on the last pages
    await db.stockMove.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ t: new Date(Date.UTC(2000, 0, 1, 0, i)), sku: item.sku, type: 'in', qty: i + 1, ref: `${TAG}-${i}`, by: 'e2e' })) });
  });
  test.afterAll(async () => { await db.stockMove.deleteMany({ where: { ref: { startsWith: TAG } } }); });

  test('pages through 20 rows at a time', async ({ page }) => {
    const total = base + 25, last = Math.ceil(total / 20);
    await loginAs(page, USERS.storekeeper);
    await page.goto('/inventory');
    const rows = page.locator('table').last().locator('tbody tr');
    await expect(rows).toHaveCount(20);
    await expectPagerText(page, 1, 20, total);

    await pager(page).getByRole('link', { name: 'ถัดไป ›' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expectPagerText(page, 21, Math.min(40, total), total);

    await page.goto(`/inventory?page=${last}`);
    await expect(rows).toHaveCount(total - (last - 1) * 20);
    await expect(rows.last()).toContainText(`${TAG}-0`); // oldest move is last
  });

  test('out-of-range and invalid pages fall back safely', async ({ page }) => {
    const total = base + 25, last = Math.ceil(total / 20);
    await loginAs(page, USERS.storekeeper);
    await page.goto('/inventory?page=999');
    await expectPagerText(page, (last - 1) * 20 + 1, total, total);
    await page.goto('/inventory?page=abc');
    await expectPagerText(page, 1, 20, total);
  });
});

test.describe('PR decision history pagination', () => {
  let base = 0;
  test.beforeAll(async () => {
    await db.purchaseRequest.deleteMany({ where: { id: { startsWith: TAG } } });
    base = await db.purchaseRequest.count({ where: { status: { notIn: ['pending', 'pending_exec'] } } });
    const [sk, mgr] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { username: USERS.storekeeper } }),
      db.user.findUniqueOrThrow({ where: { username: USERS.manager } }),
    ]);
    await db.purchaseRequest.createMany({ data: Array.from({ length: 22 }, (_, i) => ({
      id: `${TAG}-${String(i).padStart(2, '0')}`, date: new Date(Date.UTC(2000, 0, 1 + i)), requesterId: sk.id, vendor: 'E2E',
      status: i % 2 ? 'rejected' : 'received', approverId: mgr.id, decided: new Date(Date.UTC(2000, 0, 1 + i)),
    })) });
  });
  test.afterAll(async () => { await db.purchaseRequest.deleteMany({ where: { id: { startsWith: TAG } } }); });

  test('decided list is paged, pending list is not', async ({ page }) => {
    const total = base + 22;
    await loginAs(page, USERS.manager);
    await page.goto('/approvals');
    await expectPagerText(page, 1, 20, total);
    const pendingCards = await page.locator('.tcard').count();

    await pager(page).getByRole('link', { name: '2', exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expectPagerText(page, 21, Math.min(40, total), total);
    await expect(page.locator('.tcard')).toHaveCount(pendingCards); // pending cards unaffected by paging
  });

  test('history is newest decision first', async ({ page }) => {
    const total = base + 22, last = Math.ceil(total / 20);
    await loginAs(page, USERS.manager);
    await page.goto(`/approvals?page=${last}`);
    await expect(page.locator('table').last().locator('tbody tr').last()).toContainText(`${TAG}-00`);
  });
});
