import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, item, paidOrder, product, stamp } from './shop';

// After-sales by serial: look up who bought a unit and whether it is under warranty, swap it for a new one
// from stock, and send the faulty unit back to the supplier.

test.afterAll(cleanupShop);

/** Paid order for one unit of a new serial-tracked product, packed and shipped with `serials[0]`. */
async function shipped(page: Page, staff: Page) {
  const s = stamp().toUpperCase(), serials = [`W-${s}-A`, `W-${s}-B`, `W-${s}-C`];
  const other = await product(100, 1, [`W-${s}-X`]); // another product's unit
  const sku = await product(3000, 3, serials);
  const { id, c } = await paidOrder(page, { [sku]: 1 });
  await staff.goto(`/orders/${id}`);
  await staff.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await staff.locator('#sh-carrier').selectOption('Flash Express');
  await staff.locator('#sh-track').fill(`TH${s}`.slice(0, 20));
  await staff.locator(`#sn-${sku}`).fill(serials[0]);
  await staff.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(staff.getByTestId('order-status')).toHaveText('จัดส่งแล้ว');
  return { sku, serials, id, c, otherSerial: `W-${s}-X`, other };
}

test('look up a sold unit, swap it under warranty, then send the faulty one back', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { sku, serials, id, c, otherSerial } = await shipped(page, sk);
  expect(await item(sku)).toMatchObject({ qty: 2, reserved: 0 });

  await sk.goto('/warranty');
  await sk.getByLabel('ค้นหา Serial').fill(serials[0].toLowerCase());
  await sk.getByRole('button', { name: 'ตรวจสอบ' }).click();
  const card = sk.getByRole('region', { name: `Serial ${serials[0]}` });
  await expect(card.getByTestId('serial-status')).toHaveText('ขายแล้ว');
  await expect(card.getByTestId('warranty')).toContainText('อยู่ในประกันถึง');
  await expect(card).toContainText(id);
  await expect(card).toContainText(c.name);
  await expect(card).toContainText('จัดส่งสินค้า'); // history from the order

  const swap = card.getByRole('button', { name: 'ยืนยันเปลี่ยนเครื่อง' });
  await card.locator('#w-new').fill(serials[1]);
  await swap.click();
  await expect(card.locator('.err')).toContainText('กรุณาระบุอาการเสีย');
  await card.locator('#w-note').fill('เปิดไม่ติด');
  await card.locator('#w-new').fill(serials[0]);
  await swap.click();
  await expect(card.locator('.err')).toContainText('ต้องไม่ซ้ำกับเครื่องเดิม');
  await card.locator('#w-new').fill(otherSerial);
  await swap.click();
  await expect(card.locator('.err')).toContainText(`Serial ${otherSerial} ไม่ใช่`);
  await card.locator('#w-new').fill(serials[1]);
  await swap.click();
  await expect(sk).toHaveURL(new RegExp(`q=${serials[1]}`));

  const [oldS, newS] = await Promise.all(serials.slice(0, 2).map(serial => db.serialNumber.findUniqueOrThrow({ where: { serial }, include: { orderLine: true } })));
  expect([oldS.status, oldS.orderLine?.orderId]).toEqual(['claim', id]);
  expect([newS.status, newS.orderLine?.orderId]).toEqual(['sold', id]);
  expect(await item(sku)).toMatchObject({ qty: 1, reserved: 0 }); // the replacement left stock
  expect(await db.stockMove.count({ where: { sku, type: 'out', ref: `เคลม ${id}` } })).toBe(1);
  expect((await db.auditLog.findFirstOrThrow({ where: { cat: 'warranty', target: serials[0] } })).detail).toContain(`เครื่องเดิม ${serials[0]} → เครื่องใหม่ ${serials[1]}`);

  // The faulty unit waits to go back to the supplier
  await sk.goto('/warranty');
  await sk.getByRole('region', { name: 'เครื่องเสียรอส่งคืนผู้ขาย' }).getByRole('link', { name: serials[0] }).click();
  await sk.getByRole('button', { name: 'บันทึกส่งคืนผู้ขาย' }).click();
  await expect(sk.locator('.err')).toContainText('กรุณาระบุเลขที่ใบส่งคืน');
  await sk.locator('#w-rma').fill('RMA-7781');
  await sk.getByRole('button', { name: 'บันทึกส่งคืนผู้ขาย' }).click();
  await expect(sk.getByTestId('serial-status')).toHaveText('ส่งคืนผู้ขายแล้ว');
});

test('out of warranty: no swap', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { serials, id } = await shipped(page, sk);
  await db.order.update({ where: { id }, data: { shippedAt: new Date(Date.now() - 400 * 864e5) } }); // warranty is 12 months
  await sk.goto(`/warranty?q=${serials[0]}`);
  await expect(sk.getByTestId('warranty')).toContainText('หมดประกัน');
  await expect(sk.getByRole('button', { name: 'ยืนยันเปลี่ยนเครื่อง' })).toHaveCount(0);
});

test('unknown serial, and who may open the page', async ({ page }) => {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/warranty?q=NO-SUCH-SERIAL');
  await expect(page.getByRole('status')).toContainText('ไม่พบ Serial NO-SUCH-SERIAL');
  await loginAs(page, USERS.executive);
  await page.goto('/warranty');
  await expect(page).not.toHaveURL(/\/warranty/);
});
