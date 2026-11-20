import { test, expect, type Browser } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { checkout, cleanupShop, customer, event, item, mails, order, paidOrder, product, stamp, webhook } from './shop';

// Back-office fulfilment: paid → packing → shipped (carrier, tracking, serials) → completed, plus refunds,
// money that arrives after an order expired, the receipt, and who may do what.

test.afterAll(cleanupShop);

async function staff(browser: Browser, user: string) {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, user);
  return page;
}

test('paid → pack → ship with serials → customer confirms receipt', async ({ browser, page }) => {
  const s = stamp().toUpperCase(), serials = [`E2E-${s}-1`, `E2E-${s}-2`, `E2E-${s}-3`];
  const cpu = await product(5000, 3, serials), cable = await product(200, 5);
  const { id, c } = await paidOrder(page, { [cpu]: 2, [cable]: 1 });

  const sk = await staff(browser, USERS.storekeeper);
  await sk.goto('/orders');
  await expect(sk.locator('tr', { hasText: id })).toContainText('ชำระแล้ว'); // default tab: waiting to be packed
  await sk.locator('tr', { hasText: id }).getByRole('link', { name: id }).click();
  await expect(sk).toHaveURL(new RegExp(`/orders/${id}$`));
  await expect(sk.getByRole('button', { name: 'ยกเลิกและคืนเงิน' })).toHaveCount(0); // store keepers don't refund
  await sk.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await expect(sk.getByTestId('order-status')).toHaveText('กำลังแพ็ก');

  const ship = sk.getByRole('region', { name: 'จัดส่ง' });
  await ship.locator('#sh-carrier').selectOption('Kerry Express');
  await ship.locator('#sh-track').fill('kex 1234 5678');
  await ship.locator(`#sn-${cpu}`).fill(serials[0]);
  await ship.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(ship.locator('.err')).toContainText('ต้องสแกน Serial 2 ชิ้น (ได้ 1)');
  await ship.locator(`#sn-${cpu}`).fill(`${serials[0]}\nCPU-R5-7600-SN0001`); // a real serial, but another product's
  await ship.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(ship.locator('.err')).toContainText('CPU-R5-7600-SN0001 ไม่มีในสต็อกของสินค้านี้');
  await ship.locator(`#sn-${cpu}`).fill(`${serials[0].toLowerCase()}\n${serials[1]}`);
  await ship.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(sk.getByTestId('order-status')).toHaveText('จัดส่งแล้ว');

  const o = await db.order.findUniqueOrThrow({ where: { id } });
  expect([o.status, o.carrier, o.trackingNo]).toEqual(['shipped', 'Kerry Express', 'KEX12345678']);
  const sold = await db.serialNumber.findMany({ where: { sku: cpu }, orderBy: { serial: 'asc' }, include: { orderLine: true } });
  expect(sold.map(x => [x.serial, x.status, x.orderLine?.orderId ?? null])).toEqual([[serials[0], 'sold', id], [serials[1], 'sold', id], [serials[2], 'in_stock', null]]);
  await expect(sk.getByRole('region', { name: 'รายการสินค้า' })).toContainText(`Serial: ${serials[0]}, ${serials[1]}`);
  await expect.poll(() => mails().filter(m => m.to === c.email && m.subject.includes(`จัดส่งคำสั่งซื้อ ${id}`) && m.text.includes('KEX12345678') && m.text.includes(serials[1])).length).toBe(1);

  // A sold serial can't go out again with another order
  const other = await paidOrder(await (await browser.newContext()).newPage(), { [cpu]: 1 });
  await sk.goto(`/orders/${other.id}`);
  await sk.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await sk.locator('#sh-carrier').selectOption('Flash Express');
  await sk.locator('#sh-track').fill('TH0000000001');
  await sk.locator(`#sn-${cpu}`).fill(serials[0]);
  await sk.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(sk.locator('.err')).toContainText(`${serials[0]} ไม่มีในสต็อกของสินค้านี้`);

  // The customer sees the parcel and confirms receipt
  await page.goto(`/pay/${id}`);
  await expect(page.getByText('พัสดุ: Kerry Express · KEX12345678')).toBeVisible();
  await page.getByRole('button', { name: 'ได้รับสินค้าแล้ว' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('สำเร็จ');
  expect((await db.order.findUniqueOrThrow({ where: { id } })).completedAt).not.toBeNull();
  expect(await db.auditLog.findMany({ where: { cat: 'order', target: id }, orderBy: { id: 'asc' }, select: { action: true } })).toEqual(
    ['สั่งซื้อ', 'ชำระเงินสำเร็จ · ตัดสต็อก', 'เริ่มแพ็กสินค้า', 'จัดส่งสินค้า', 'ลูกค้ายืนยันรับสินค้า'].map(action => ({ action })));
});

test('receipt shows the total with VAT broken out, for staff and for the customer', async ({ browser, page }) => {
  const sku = await product(1070, 2);
  const { id } = await paidOrder(page, { [sku]: 1 }, 'นนทบุรี'); // free shipping: total ฿1,070 = 1,000 + VAT 70
  await page.goto(`/pay/${id}`);
  await page.getByRole('button', { name: 'ใบเสร็จ PDF' }).click();
  const r = page.locator('#receipt-print');
  await expect(r).toContainText('RC' + id.slice(3));
  await expect(r).toContainText('ใบกำกับภาษีอย่างย่อ');
  await expect(r).toContainText('฿1,000.00');
  await expect(r).toContainText('฿70.00');
  await expect(r.getByTestId('receipt-total')).toHaveText('฿1,070.00');

  const sk = await staff(browser, USERS.storekeeper);
  await sk.goto(`/orders/${id}`);
  await sk.getByRole('button', { name: 'ใบเสร็จ PDF' }).click();
  await expect(sk.locator('#receipt-print').getByTestId('receipt-total')).toHaveText('฿1,070.00');
});

test('manager cancels a paid order: money back, units back on the shelf', async ({ browser, page }) => {
  const sku = await product(400, 5);
  const { id, c } = await paidOrder(page, { [sku]: 2 });
  expect(await item(sku)).toMatchObject({ qty: 3, reserved: 0 });

  const mg = await staff(browser, USERS.manager);
  await mg.goto(`/orders/${id}`);
  await mg.getByRole('button', { name: 'ยกเลิกและคืนเงิน' }).click();
  const dlg = mg.getByRole('dialog');
  await dlg.getByRole('button', { name: 'ยืนยันคืนเงิน' }).click();
  await expect(dlg.locator('.err')).toContainText('กรุณาระบุเหตุผลที่คืนเงิน');
  await dlg.locator('#rf-reason').fill('สินค้าล็อตนี้มีปัญหา');
  await dlg.getByRole('button', { name: 'ยืนยันคืนเงิน' }).click();
  await expect(dlg.locator('.err')).toContainText('กรุณาระบุเลขอ้างอิงการโอนคืน');
  await dlg.locator('#rf-ref').fill('TRF-998877');
  await dlg.getByRole('button', { name: 'ยืนยันคืนเงิน' }).click();
  await expect(mg.getByTestId('order-status')).toHaveText('คืนเงินแล้ว');

  const o = await order(id);
  expect(o).toMatchObject({ status: 'refunded', refundReason: 'สินค้าล็อตนี้มีปัญหา', refundRef: 'TRF-998877' });
  expect(o.payments[0].status).toBe('refunded');
  expect(await item(sku)).toMatchObject({ qty: 5, reserved: 0 });
  expect(await db.stockMove.count({ where: { sku, type: 'return', qty: 2, ref: id } })).toBe(1);
  await expect.poll(() => mails().filter(m => m.to === c.email && m.subject.includes(`คืนเงินคำสั่งซื้อ ${id}`)).length).toBe(1);
  // Nothing left to do with it
  await expect(mg.getByRole('button', { name: /เริ่มแพ็ก|ยกเลิกและคืนเงิน/ })).toHaveCount(0);
});

test('money that arrives after an order expired is listed until it is sent back', async ({ browser, page }) => {
  const sku = await product(300, 2);
  await customer(page, { [sku]: 1 });
  const id = await checkout(page);
  const { payments: [p], total } = await order(id);
  await db.order.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await page.reload(); // the payment page expires it
  expect((await order(id)).status).toBe('expired');
  expect(await (await webhook(page, event(p.providerRef!, Number(total).toFixed(2)))).json()).toMatchObject({ result: 'late payment' });

  const sk = await staff(browser, USERS.storekeeper);
  await sk.goto('/orders?tab=refund');
  await expect(sk.locator('tr', { hasText: id })).toContainText('ต้องคืนเงิน');
  await sk.goto(`/orders/${id}`);
  await expect(sk.getByTestId('late-money')).toContainText('Manager หรือ Admin เป็นผู้บันทึก');
  await expect(sk.getByRole('button', { name: 'บันทึกการคืนเงิน' })).toHaveCount(0);

  const ad = await staff(browser, USERS.admin);
  await ad.goto(`/orders/${id}`);
  await ad.getByRole('button', { name: 'บันทึกการคืนเงิน' }).click();
  await ad.locator('#rf-ref').fill('TRF-LATE-1');
  await ad.getByRole('dialog').getByRole('button', { name: 'ยืนยันคืนเงิน' }).click();
  await expect(ad.getByTestId('late-money')).toHaveCount(0);
  expect((await order(id)).payments[0].status).toBe('refunded');
  await ad.goto('/orders?tab=refund');
  await expect(ad.locator('tr', { hasText: id })).toHaveCount(0);
  expect(await item(sku)).toMatchObject({ qty: 2, reserved: 0 }); // never became a sale
});

test('order list: search by customer and by tracking number', async ({ browser, page }) => {
  const sku = await product(100, 2);
  const { id, c } = await paidOrder(page, { [sku]: 1 });
  const sk = await staff(browser, USERS.storekeeper);
  await sk.goto(`/orders?tab=all&q=${encodeURIComponent(c.email)}`);
  await expect(sk.locator('tbody tr')).toHaveCount(1);
  await expect(sk.locator('tbody tr')).toContainText(id);
  await sk.goto('/orders?tab=all&q=ไม่มีแน่นอน-zzz');
  await expect(sk.getByText('ไม่พบคำสั่งซื้อที่ค้นหา')).toBeVisible();
});

test('the menu badge counts orders waiting to be packed', async ({ browser, page }) => {
  const sku = await product(100, 2);
  await paidOrder(page, { [sku]: 1 });
  const sk = await staff(browser, USERS.storekeeper);
  const n = await db.order.count({ where: { status: 'paid' } }) + await db.order.count({ where: { status: { in: ['expired', 'cancelled'] }, payments: { some: { status: 'successful' } } } });
  await sk.goto('/orders');
  await expect(sk.getByRole('link', { name: /คำสั่งซื้อ & จัดส่ง/ })).toContainText(String(n));
});

for (const [user, allowed] of [[USERS.storekeeper, true], [USERS.manager, true], [USERS.admin, true], [USERS.itsupport, false], [USERS.executive, false]] as const) {
  test(`${user} ${allowed ? 'can' : 'cannot'} open orders`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto('/orders');
    if (allowed) await expect(page).toHaveURL(/\/orders$/);
    else await expect(page).not.toHaveURL(/\/orders/);
  });
}
