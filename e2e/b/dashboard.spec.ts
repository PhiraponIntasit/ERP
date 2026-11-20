import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, paidOrder, product } from './shop';

// The store dashboard: every queue number matches the database, links to the screen that handles it,
// and a new storefront order shows up at once (today's sales, "to pack", the latest orders).

const kpi = (page: Page, label: string) => page.getByTestId('dash-kpis').locator('.kpi', { hasText: label });
const value = (page: Page, label: string) => kpi(page, label).locator('.kpi-value');
test.afterAll(cleanupShop);

test('dashboard queues match the database and link to where they are handled', async ({ page }) => {
  const [toPack, packing, unpaid, submitted, received, pending] = await Promise.all([
    db.order.count({ where: { status: 'paid' } }),
    db.order.count({ where: { status: 'packing' } }),
    db.order.count({ where: { status: 'pending_payment' } }),
    db.claim.count({ where: { status: 'submitted' } }),
    db.claim.count({ where: { status: 'received' } }),
    db.purchaseRequest.count({ where: { status: { in: ['pending', 'pending_exec'] } } }),
  ]);
  await loginAs(page, USERS.manager);
  await page.goto('/dashboard');
  await expect(value(page, 'รอแพ็ก')).toHaveText(`${toPack}ออเดอร์`);
  await expect(kpi(page, 'รอแพ็ก')).toContainText(`กำลังแพ็ก ${packing} · รอชำระ ${unpaid}`);
  await expect(value(page, 'เคลมรอดำเนินการ')).toHaveText(`${submitted + received}เรื่อง`);
  await expect(kpi(page, 'เคลมรอดำเนินการ')).toContainText(`รอรับเครื่อง ${submitted} · กำลังตรวจสอบ ${received}`);
  await expect(value(page, 'รออนุมัติจัดซื้อ')).toHaveText(`${pending}ใบ`);
  await expect(page.getByText(/สถานะงานซ่อม|คำร้องที่เปิดอยู่/)).toHaveCount(0); // the old helpdesk dashboard is gone

  await kpi(page, 'รอแพ็ก').click();
  await expect(page).toHaveURL(/\/orders\?tab=topack$/);
  await page.goto('/dashboard');
  await kpi(page, 'เคลมรอดำเนินการ').click();
  await expect(page).toHaveURL(/\/claims$/);
});

test('a paid storefront order appears on the dashboard right away', async ({ page, browser }) => {
  const sku = await product(2500, 3);
  const mg = await (await browser.newContext()).newPage();
  await loginAs(mg, USERS.manager);
  await mg.goto('/dashboard');
  const before = { pack: Number((await value(mg, 'รอแพ็ก').innerText()).replace(/\D/g, '')), today: await value(mg, 'ยอดขายวันนี้').innerText() };

  const { id } = await paidOrder(page, { [sku]: 1 });
  await mg.reload();
  await expect(value(mg, 'รอแพ็ก')).toHaveText(`${before.pack + 1}ออเดอร์`);
  const toNum = (s: string) => Number(s.replace(/[^\d]/g, ''));
  expect(toNum(await value(mg, 'ยอดขายวันนี้').innerText())).toBe(toNum(before.today) + 2500);
  const row = mg.getByRole('table', { name: 'คำสั่งซื้อล่าสุด' }).locator('tr', { hasText: id });
  await expect(row).toContainText('ชำระแล้ว');
  await row.getByRole('link', { name: id }).click();
  await expect(mg).toHaveURL(new RegExp(`/orders/${id}$`));
  await mg.context().close();
});

test('executive sees the figures but not links to screens they cannot open', async ({ page }) => {
  await loginAs(page, USERS.executive);
  await page.goto('/dashboard');
  await expect(kpi(page, 'ยอดขาย 7 วัน')).toHaveAttribute('href', '/sales?p=7d');
  await expect(kpi(page, 'รอแพ็ก')).not.toHaveAttribute('href', /./);
  await expect(page.getByRole('table', { name: 'คำสั่งซื้อล่าสุด' }).getByRole('link')).toHaveCount(0);
});
