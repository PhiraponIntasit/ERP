import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { available, release, reserve, sellReserved, take } from '../../src/server/stock-reserve';

// Phase 2 (back office): stock held for unpaid orders, suppliers on purchase requests,
// and per-unit serial numbers captured when serial-tracked goods are received.

const stamp = () => Date.now().toString(36).toUpperCase();
const TRACKED = 'CPU-R5-7600'; // seeded serial-tracked CPU, serials CPU-R5-7600-SN0001…

test.describe('stock reservation', () => {
  const sku = `E2E-RSV-${stamp()}`;
  test.beforeAll(async () => { await db.inventoryItem.create({ data: { sku, name: `E2E reserve ${sku}`, cat: 'ทดสอบ', unit: 'ชิ้น', qty: 5, min: 1, cost: 10, price: 20, loc: '-' } }); });
  test.afterAll(async () => { await db.inventoryItem.delete({ where: { sku } }); });
  const item = () => db.inventoryItem.findUniqueOrThrow({ where: { sku } });

  test('holds, hands back and sells units without ever over-committing', async () => {
    expect(await reserve(db, sku, 6)).toBe(false);          // only 5 on hand
    expect(await reserve(db, sku, 3)).toBe(true);
    expect(available(await item())).toBe(2);
    expect(await reserve(db, sku, 3)).toBe(false);          // 2 left to hold
    expect(await take(db, sku, 3)).toBe(false);             // a withdrawal can't dip into the hold
    expect(await take(db, sku, 2)).toBe(true);
    expect(await item()).toMatchObject({ qty: 3, reserved: 3 });
    expect(await release(db, sku, 4)).toBe(false);          // can't give back more than is held
    expect(await release(db, sku, 1)).toBe(true);
    expect(await sellReserved(db, sku, 2)).toBe(true);      // paid: held units leave the store
    expect(await item()).toMatchObject({ qty: 1, reserved: 0 });
    expect(await sellReserved(db, sku, 1)).toBe(false);     // nothing held any more
  });

  test('two buyers racing for the last units: exactly one wins', async () => {
    await db.inventoryItem.update({ where: { sku }, data: { qty: 1, reserved: 0 } });
    const wins = await Promise.all(Array.from({ length: 5 }, () => db.$transaction(tx => reserve(tx, sku, 1))));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await item()).toMatchObject({ qty: 1, reserved: 1 });
  });

  test('inventory and low-stock count what is free, not what is held', async ({ page }) => {
    await db.inventoryItem.update({ where: { sku }, data: { qty: 4, min: 2, reserved: 3 } });
    await loginAs(page, USERS.storekeeper);
    await page.goto('/inventory');
    const row = page.locator('tr', { hasText: `E2E reserve ${sku}` });
    await expect(row).toContainText('จอง 3');
    // 4 on hand − 3 held = 1 ≤ reorder point 2 → the PR form suggests topping it up
    await page.goto('/purchase');
    await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
    await expect(page.getByLabel(`จำนวนสั่ง E2E reserve ${sku}`)).not.toHaveValue('');
  });
});

test.describe('suppliers', () => {
  const name = `E2E ผู้ขาย ${stamp()}`;
  test.afterAll(async () => { await db.supplier.deleteMany({ where: { name: { startsWith: name } } }); });

  test('add, validate, edit and stop using a supplier', async ({ page }) => {
    await loginAs(page, USERS.storekeeper);
    await page.goto('/purchase');
    await page.getByRole('link', { name: 'ผู้ขาย', exact: true }).click();
    await expect(page).toHaveURL(/\/purchase\/suppliers$/);

    await page.getByRole('button', { name: '+ เพิ่มผู้ขาย' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#sp-name').fill(name);
    await dlg.locator('#sp-taxId').fill('12345');
    await dlg.getByRole('button', { name: 'บันทึก' }).click();
    await expect(dlg.locator('.err')).toContainText('ต้องมี 13 หลัก');
    await dlg.locator('#sp-taxId').fill('0-1055-61234-56-7');
    await dlg.locator('#sp-email').fill('Sales@Example.com');
    await dlg.getByRole('button', { name: 'บันทึก' }).click();
    await expect(dlg).toBeHidden();
    const s = await db.supplier.findFirstOrThrow({ where: { name } });
    expect([s.taxId, s.email, s.active]).toEqual(['0105561234567', 'sales@example.com', true]);

    // Same name twice is refused
    await page.getByRole('button', { name: '+ เพิ่มผู้ขาย' }).click();
    await dlg.locator('#sp-name').fill(name.toUpperCase());
    await dlg.getByRole('button', { name: 'บันทึก' }).click();
    await expect(dlg.locator('.err')).toContainText('มีผู้ขายชื่อนี้แล้ว');
    await dlg.getByRole('button', { name: 'ยกเลิก' }).click();

    await page.getByRole('button', { name: `แก้ไข ${name}` }).click();
    await dlg.locator('#sp-phone').fill('02-000-0000');
    await dlg.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.locator('tr', { hasText: name })).toContainText('02-000-0000');
    expect(await db.auditLog.count({ where: { cat: 'purchase', target: name, action: { in: ['เพิ่มผู้ขาย', 'แก้ไขผู้ขาย'] } } })).toBe(2);

    // Offered on a new PR while active, gone once stopped
    await page.goto('/purchase');
    await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
    await expect(page.locator('#pr-s option', { hasText: name })).toHaveCount(1);
    await page.goto('/purchase/suppliers');
    await page.getByRole('button', { name: `หยุดใช้ ${name}` }).click();
    await expect(page.getByRole('button', { name: `เปิดใช้ ${name}` })).toBeVisible();
    await page.goto('/purchase');
    await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
    await expect(page.locator('#pr-s option', { hasText: name })).toHaveCount(0);
  });

  test('a PR must name a supplier', async ({ page }) => {
    await loginAs(page, USERS.storekeeper);
    await page.goto('/purchase');
    await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#pr-s').selectOption('');
    await dlg.getByLabel('จำนวนสั่ง HDMI 2.1 Cable 2m').fill('1');
    await dlg.getByRole('button', { name: 'ส่งขออนุมัติ' }).click();
    await expect(dlg.locator('.err')).toContainText('กรุณาเลือกผู้ขาย');
  });

  test('only purchasing roles can open the supplier list', async ({ page }) => {
    await loginAs(page, USERS.itsupport);
    await page.goto('/purchase/suppliers');
    await expect(page).not.toHaveURL(/\/purchase\/suppliers/);
  });
});

test.describe('serial numbers on receiving', () => {
  const added: string[] = [];
  let restore = 0;
  test.afterAll(async () => {
    await db.serialNumber.deleteMany({ where: { serial: { in: added } } });
    if (restore) await db.inventoryItem.update({ where: { sku: TRACKED }, data: { qty: { decrement: restore } } });
  });

  async function approvedPR(page: Page, qty: number) {
    const note = `E2E serial ${stamp()}`;
    await loginAs(page, USERS.storekeeper);
    await page.goto('/purchase');
    await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#pr-s').selectOption({ label: 'บจก. คอมพาร์ท ดิสทริบิวชั่น' });
    await dlg.locator('#pr-n').fill(note);
    for (const input of await dlg.locator('input[aria-label^="จำนวนสั่ง"]').all()) await input.fill('');
    await dlg.getByLabel('จำนวนสั่ง AMD Ryzen 5 7600').fill(String(qty));
    await dlg.getByRole('button', { name: 'ส่งขออนุมัติ' }).click();
    await expect(dlg).toBeHidden();
    const pr = await db.purchaseRequest.findFirstOrThrow({ where: { note } });
    expect([pr.supplierId, pr.vendor]).toEqual(['sup-2', 'บจก. คอมพาร์ท ดิสทริบิวชั่น']);
    const mgr = await db.user.findUniqueOrThrow({ where: { username: USERS.manager } });
    await db.purchaseRequest.update({ where: { id: pr.id }, data: { status: 'approved', approverId: mgr.id, decided: new Date() } });
    return pr.id;
  }

  test('receiving a PR asks for one valid, new serial per unit', async ({ page }) => {
    const id = await approvedPR(page, 2);
    const before = (await db.inventoryItem.findUniqueOrThrow({ where: { sku: TRACKED } })).qty;
    await page.goto('/purchase');
    await page.locator('tr', { hasText: id }).getByRole('button', { name: 'รับเข้าคลัง' }).click();
    const dlg = page.getByRole('dialog');
    const box = dlg.locator(`#rs-${TRACKED}`), save = dlg.getByRole('button', { name: 'รับเข้าคลัง' });

    await box.fill(`E2E-${id}-A`);
    await save.click();
    await expect(dlg.locator('.err')).toContainText('ต้องสแกน Serial 2 ชิ้น (ได้ 1)');
    await box.fill(`E2E-${id}-A\nE2E-${id}-A`);
    await save.click();
    await expect(dlg.locator('.err')).toContainText('ซ้ำกันในรายการ');
    await box.fill(`E2E-${id}-A\n${TRACKED}-SN0001`);
    await save.click();
    await expect(dlg.locator('.err')).toContainText('มีในระบบแล้ว');
    expect(await db.purchaseRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'approved' });

    const serials = [`E2E-${id}-A`, `E2E-${id}-B`];
    added.push(...serials);
    await box.fill(serials.map(s => s.toLowerCase()).join('\n')); // scanners may send lower case
    await expect(dlg).toContainText('(2/2)');
    await save.click();
    await expect(dlg).toBeHidden();
    restore += 2;
    expect((await db.purchaseRequest.findUniqueOrThrow({ where: { id } })).status).toBe('received');
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { sku: TRACKED } })).qty).toBe(before + 2);
    const rows = await db.serialNumber.findMany({ where: { serial: { in: serials } }, orderBy: { serial: 'asc' } });
    expect(rows.map(r => [r.serial, r.sku, r.status, r.receivedRef])).toEqual(serials.map(s => [s, TRACKED, 'in_stock', id]));
    expect((await db.auditLog.findFirstOrThrow({ where: { target: id, action: 'รับสินค้าเข้าคลังตามใบขอซื้อ' } })).detail).toContain('Serial 2 ชิ้น');
  });

  test('manual receipt of a serial-tracked product needs serials too', async ({ page }) => {
    await loginAs(page, USERS.storekeeper);
    await page.goto('/inventory');
    await page.locator('tr', { hasText: 'AMD Ryzen 5 7600' }).getByRole('button', { name: '+ เพิ่ม' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#r-qty').fill('1');
    await dlg.locator('#r-note').fill('E2E ใบส่งของ');
    await dlg.getByRole('button', { name: 'บันทึกรับเข้า' }).click();
    await expect(dlg.locator('.err')).toContainText('ต้องสแกน Serial 1 ชิ้น (ได้ 0)');
    const serial = `E2E-MAN-${stamp()}`;
    added.push(serial);
    await dlg.locator('#r-serials').fill(serial);
    await dlg.getByRole('button', { name: 'บันทึกรับเข้า' }).click();
    await expect(dlg).toBeHidden();
    restore += 1;
    expect(await db.serialNumber.findUniqueOrThrow({ where: { serial } })).toMatchObject({ sku: TRACKED, receivedRef: 'E2E ใบส่งของ' });
  });

  test('untracked products are received without serials', async ({ page }) => {
    await loginAs(page, USERS.storekeeper);
    await page.goto('/inventory');
    await page.locator('tr', { hasText: 'HDMI 2.1 Cable 2m' }).getByRole('button', { name: '+ เพิ่ม' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#r-qty').fill('1');
    await expect(dlg.locator('#r-serials')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'ยกเลิก' }).click();
  });
});
