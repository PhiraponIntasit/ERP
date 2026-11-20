import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, item, product, stamp } from './shop';

// Stock adjustments: write off damaged/lost units and set stock from a physical count. Units held for unpaid orders
// can't be taken, serial-tracked units go by serial, every change is a stock move + audit row, and the storefront
// shows the new quantity at once.

test.afterAll(cleanupShop);

const row = (page: Page, name: string) => page.locator('tbody tr', { hasText: name });
async function open(page: Page, name: string) {
  await page.goto('/inventory');
  await row(page, name).getByRole('button', { name: 'ปรับยอด' }).click();
  return page.getByRole('dialog');
}

test('count and write-off change stock, never below what unpaid orders hold, and the storefront follows', async ({ page, browser }) => {
  const s = stamp().toUpperCase(), name = `E2E สายแลน ${s}`;
  const sku = await product(150, 5, undefined, name);
  await db.inventoryItem.update({ where: { sku }, data: { slug: sku.toLowerCase() } });
  await db.inventoryItem.update({ where: { sku }, data: { reserved: 1 } }); // one unit held for an unpaid order
  await loginAs(page, USERS.storekeeper);

  // Count: 3 on the shelf → 5 becomes 3 (−2), shown before saving.
  let dlg = await open(page, name);
  await dlg.getByRole('radio', { name: 'ตรวจนับ' }).click();
  await dlg.getByLabel('จำนวนที่นับได้จริง').fill('3');
  await dlg.getByLabel('เหตุผล').fill('ตรวจนับประจำเดือน');
  await expect(dlg.getByTestId('adj-preview')).toHaveText('ยอดจะเปลี่ยน 5 → 3 (−2) · มูลค่าทุน ฿150');
  await dlg.getByRole('button', { name: 'บันทึกปรับยอด' }).click();
  await expect(dlg).toBeHidden();
  expect(await item(sku)).toMatchObject({ qty: 3, reserved: 1 });

  // Write-off more than is free (3 − 1 reserved = 2) is refused; 2 goes through.
  dlg = await open(page, name);
  await dlg.getByRole('radio', { name: 'ชำรุด / ตัดของเสีย' }).click();
  await dlg.getByLabel('จำนวนที่ตัดออก').fill('3');
  await dlg.getByLabel('เหตุผล').fill('กล่องเปียกน้ำ');
  await dlg.getByRole('button', { name: 'บันทึกปรับยอด' }).click();
  await expect(dlg.getByText('ปรับลดได้ไม่เกิน 2 ชิ้น — อีก 1 ชิ้น จองให้คำสั่งซื้อที่รอชำระ')).toBeVisible();
  await dlg.getByLabel('จำนวนที่ตัดออก').fill('2');
  await dlg.getByRole('button', { name: 'บันทึกปรับยอด' }).click();
  await expect(dlg).toBeHidden();
  expect(await item(sku)).toMatchObject({ qty: 1, reserved: 1 });

  // History and audit tell what happened and why.
  await expect(page.locator('tbody tr', { hasText: 'ตัดของเสีย: กล่องเปียกน้ำ' })).toContainText('ปรับยอดลด');
  expect(await db.stockMove.findMany({ where: { sku, type: 'adjust_out' }, orderBy: { t: 'asc' }, select: { qty: true, ref: true } }))
    .toEqual([{ qty: 2, ref: 'ตรวจนับ: ตรวจนับประจำเดือน' }, { qty: 2, ref: 'ตัดของเสีย: กล่องเปียกน้ำ' }]);
  expect(await db.auditLog.count({ where: { action: 'ปรับยอดสต็อก', target: sku } })).toBe(2);

  // Storefront: nothing left to sell (the last unit is held for the unpaid order).
  const shop = await (await browser.newContext()).newPage();
  await shop.goto(`/p/${sku.toLowerCase()}`);
  await expect(shop.getByRole('button', { name: 'สินค้าหมด' })).toBeDisabled();

  // A count that finds more puts them back on sale.
  dlg = await open(page, name);
  await dlg.getByRole('radio', { name: 'ตรวจนับ' }).click();
  await dlg.getByLabel('จำนวนที่นับได้จริง').fill('4');
  await dlg.getByLabel('เหตุผล').fill('พบในกล่องสำรองหลังร้าน');
  await dlg.getByRole('button', { name: 'บันทึกปรับยอด' }).click();
  await expect(dlg).toBeHidden();
  expect(await item(sku)).toMatchObject({ qty: 4, reserved: 1 });
  await shop.reload();
  await expect(shop.getByText('เหลือ 3 ชิ้น')).toBeVisible();
  await shop.context().close();
});

test('serial-tracked units are written off by serial and cannot be sold afterwards', async ({ page }) => {
  const s = stamp().toUpperCase(), name = `E2E SSD ${s}`, serials = [`ADJ-${s}-1`, `ADJ-${s}-2`, `ADJ-${s}-3`];
  const sku = await product(2400, 3, serials, name);
  await loginAs(page, USERS.storekeeper);
  const dlg = await open(page, name);
  await expect(dlg.getByRole('radio', { name: 'ตรวจนับ' })).toHaveCount(0); // counts need serials: receive or write off instead
  await dlg.getByRole('radio', { name: 'สูญหาย' }).click();
  await dlg.getByRole('checkbox', { name: serials[1] }).check();
  await dlg.getByLabel('เหตุผล').fill('ตรวจไม่พบระหว่างย้ายชั้นวาง');
  await expect(dlg.getByTestId('adj-preview')).toHaveText('ยอดจะเปลี่ยน 3 → 2 (−1) · มูลค่าทุน ฿1,200');
  await dlg.getByRole('button', { name: 'บันทึกปรับยอด' }).click();
  await expect(dlg).toBeHidden();

  expect(await item(sku)).toMatchObject({ qty: 2 });
  expect((await db.serialNumber.findUniqueOrThrow({ where: { serial: serials[1] } })).status).toBe('scrapped');
  await page.goto(`/warranty?q=${serials[1]}`);
  await expect(page.getByTestId('serial-status')).toHaveText('ตัดจำหน่ายแล้ว (ชำรุด/สูญหาย)');
  expect(await db.serialNumber.count({ where: { sku, status: 'in_stock' } })).toBe(2); // shelf serials still match qty (integrity rule 5)
});

test('only stock managers can adjust', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: 'ปรับยอด' })).toHaveCount(0);
});
