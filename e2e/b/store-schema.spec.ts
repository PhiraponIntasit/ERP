import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// Store schema: `price` is the selling price, `cost` the purchase cost; stock reserved for
// unpaid orders is kept between 0 and what is on hand by the database itself.

const SKU = 'CPU-R5-7600'; // seeded: cost 6,290 · price 6,990

test('purchase requests are priced at cost, not at the selling price', async ({ page }) => {
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { sku: SKU } });
  expect(Number(item.cost)).toBeLessThan(Number(item.price));
  const vendor = `E2E cost ${Date.now()}`;

  await loginAs(page, USERS.storekeeper);
  await page.goto('/purchase');
  await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#pr-v').fill(vendor);
  for (const input of await dlg.locator('input[aria-label^="จำนวนสั่ง"]').all()) await input.fill('');
  await dlg.getByLabel(`จำนวนสั่ง ${item.name}`).fill('2');
  await dlg.getByRole('button', { name: 'ส่งขออนุมัติ' }).click();
  await expect(dlg).toBeHidden();

  const pr = await db.purchaseRequest.findFirstOrThrow({ where: { vendor }, include: { lines: true } });
  expect(pr.lines.map(l => [l.sku, Number(l.price)])).toEqual([[SKU, Number(item.cost)]]);
});

test('reserved stock can never be negative or exceed stock on hand', async () => {
  const { qty } = await db.inventoryItem.findUniqueOrThrow({ where: { sku: SKU } });
  await expect(db.inventoryItem.update({ where: { sku: SKU }, data: { reserved: qty + 1 } })).rejects.toThrow(/InventoryItem_reserved_range/);
  await expect(db.inventoryItem.update({ where: { sku: SKU }, data: { reserved: -1 } })).rejects.toThrow(/InventoryItem_reserved_range/);
  // Taking stock below what is reserved is refused too
  await db.inventoryItem.update({ where: { sku: SKU }, data: { reserved: 2 } });
  try {
    await expect(db.inventoryItem.update({ where: { sku: SKU }, data: { qty: 1 } })).rejects.toThrow(/InventoryItem_reserved_range/);
  } finally {
    await db.inventoryItem.update({ where: { sku: SKU }, data: { reserved: 0 } });
  }
});
