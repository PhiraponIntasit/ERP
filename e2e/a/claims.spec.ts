import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, item, mails, paidOrder, product, stamp } from '../b/shop';

// Warranty claims: the customer reports a faulty unit from their own order, the shop receives it, then either
// swaps it for a new unit from stock (through replaceUnit) or rejects it with a reason. Email at every step.

const PFX = 'E2ECL-';

test.afterAll(async () => {
  await db.claim.deleteMany({ where: { serial: { startsWith: PFX } } });
  await cleanupShop();
});

/** A customer (signed in on `page`) with a shipped order holding `serials[0]`; `serials[1..]` are spares in stock. */
async function shipped(page: Page, staff: Page) {
  const s = stamp().toUpperCase(), serials = [`${PFX}${s}-A`, `${PFX}${s}-B`, `${PFX}${s}-C`];
  const sku = await product(4000, 3, serials, `E2E การ์ดจอ ${s}`);
  await db.inventoryItem.update({ where: { sku }, data: { warrantyMonths: 36 } });
  const { id, c } = await paidOrder(page, { [sku]: 1 });
  await staff.goto(`/orders/${id}`);
  await staff.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await staff.locator('#sh-carrier').selectOption('Flash Express');
  await staff.locator('#sh-track').fill(`TH${s}`.slice(0, 20));
  await staff.locator(`#sn-${sku}`).fill(serials[0]);
  await staff.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(staff.getByTestId('order-status')).toHaveText('จัดส่งแล้ว');
  return { sku, serials, id, c };
}

async function fileClaim(page: Page, serial: string, problem = 'เปิดเครื่องแล้วไม่ขึ้นภาพ พัดลมหมุนแต่จอไม่มีสัญญาณ') {
  await page.goto('/account/claims/new');
  await page.getByRole('radio', { name: new RegExp(serial) }).check();
  await page.getByLabel('อาการเสีย').fill(problem);
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page).toHaveURL(/\/account\/claims\?new=CLM-/);
  return new URL(page.url()).searchParams.get('new')!;
}

const card = (page: Page, id: string) => page.locator(`[data-claim="${id}"]`);

test('customer files a claim, the shop receives the unit and swaps it from stock', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { sku, serials, id: orderId, c } = await shipped(page, sk);

  // Account page links to claims; the form only offers this customer's units.
  await page.goto('/account');
  await page.getByRole('link', { name: 'ดูการเคลม' }).click();
  await expect(page.getByText('ยังไม่มีการแจ้งเคลม')).toBeVisible();
  await page.goto('/account/claims/new');
  await expect(page.getByRole('radio')).toHaveCount(1);
  await page.getByLabel('อาการเสีย').fill('สั้น');
  await page.getByRole('radio', { name: new RegExp(serials[0]) }).check();
  await page.getByLabel('อาการเสีย').evaluate((e: HTMLTextAreaElement) => e.removeAttribute('minlength'));
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page.getByText('กรุณาอธิบายอาการเสียอย่างน้อย 10 ตัวอักษร')).toBeVisible();

  const claimId = await fileClaim(page, serials[0]);
  expect(claimId).toMatch(/^CLM-\d{4}-\d{6}$/);
  await expect(page.getByRole('status')).toContainText(`ส่งเรื่องเคลม ${claimId} แล้ว`);
  await expect(page.getByRole('status')).toContainText('บริษัท คอร์พิค จำกัด');
  await expect(card(page, claimId)).toContainText('รอส่งเครื่องให้ร้าน');
  await expect(card(page, claimId)).toContainText(orderId);
  expect(mails().some(m => m.to === c.email && m.subject === `รับเรื่องเคลม ${claimId} แล้ว`)).toBe(true);

  // Same unit can't be claimed twice while the first is open.
  await page.goto('/account/claims/new');
  await expect(page.getByRole('radio', { name: new RegExp(serials[0]) })).toBeDisabled();
  await expect(page.getByText(`มีเคลม ${claimId} อยู่แล้ว`)).toBeVisible();

  // Back office: queue, badge, receive.
  await sk.goto('/claims');
  await expect(sk.locator(`tr[data-claim="${claimId}"]`)).toContainText('รอส่งเครื่องให้ร้าน');
  await expect(sk.getByRole('link', { name: /เคลมสินค้า/ }).first()).toBeVisible();
  await sk.locator(`tr[data-claim="${claimId}"]`).getByRole('link', { name: claimId }).click();
  await expect(sk.getByTestId('warranty-until')).toContainText('อยู่ในประกัน');
  await sk.getByRole('button', { name: 'รับเครื่องแล้ว' }).click();
  await expect(sk.getByTestId('claim-status')).toHaveText('ร้านได้รับเครื่อง · กำลังตรวจสอบ');
  expect(mails().some(m => m.to === c.email && m.subject === `ร้านได้รับสินค้าเคลม ${claimId} แล้ว`)).toBe(true);
  await page.goto('/account/claims');
  await expect(card(page, claimId)).toContainText('ร้านได้รับเครื่อง');
  await expect(card(page, claimId).getByRole('button', { name: 'ยกเลิกเคลม' })).toHaveCount(0);

  // A serial that isn't this product in stock is refused, then the real spare goes through.
  await sk.getByLabel('Serial เครื่องใหม่').fill('NO-SUCH-SERIAL');
  await sk.getByRole('button', { name: 'อนุมัติและเปลี่ยนเครื่อง' }).click();
  await expect(sk.getByText(/ไม่ใช่ .* ที่อยู่ในสต็อก/)).toBeVisible();
  expect(await item(sku)).toMatchObject({ qty: 2, reserved: 0 });
  await sk.getByLabel('Serial เครื่องใหม่').fill(serials[1].toLowerCase());
  await sk.getByLabel(/หมายเหตุถึงลูกค้า/).fill('ส่งเครื่องใหม่ Flash TH123');
  await sk.getByRole('button', { name: 'อนุมัติและเปลี่ยนเครื่อง' }).click();
  await expect(sk.getByTestId('claim-status')).toHaveText('เปลี่ยนเครื่องใหม่แล้ว');
  await expect(sk.getByText(`Serial ${serials[1]}`)).toBeVisible();

  // Stock and serials moved exactly as replaceUnit does; the claim closed.
  expect(await item(sku)).toMatchObject({ qty: 1, reserved: 0 });
  const [oldU, newU] = await Promise.all(serials.slice(0, 2).map(serial => db.serialNumber.findUniqueOrThrow({ where: { serial } })));
  expect(oldU.status).toBe('claim');
  expect(newU.status).toBe('sold');
  expect(newU.orderLineId).toBe(oldU.orderLineId);
  expect(await db.claim.findUniqueOrThrow({ where: { id: claimId } })).toMatchObject({ status: 'replaced', newSerial: serials[1], staffNote: 'ส่งเครื่องใหม่ Flash TH123' });
  expect(await db.auditLog.count({ where: { cat: 'warranty', target: serials[0], action: { in: ['ลูกค้าแจ้งเคลม', 'รับเครื่องเคลม', 'เปลี่ยนสินค้าตามประกัน', 'อนุมัติเคลม · เปลี่ยนเครื่อง'] } } })).toBe(4);
  expect(mails().some(m => m.to === c.email && m.subject === `ผลการเคลม ${claimId}: เปลี่ยนเครื่องใหม่ให้แล้ว` && m.text.includes(serials[1]))).toBe(true);

  // Customer sees the new unit; the old one can't be claimed again, the new one can.
  await page.goto('/account/claims');
  await expect(card(page, claimId)).toContainText(`เปลี่ยนเป็นเครื่องใหม่ Serial ${serials[1]}`);
  await page.goto('/account/claims/new');
  await expect(page.getByRole('radio', { name: new RegExp(serials[0]) })).toBeDisabled();
  await expect(page.getByRole('radio', { name: new RegExp(serials[1]) })).toBeEnabled();
  await sk.context().close();
});

test('customer cancels a claim; the shop rejects another with a reason', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { serials, c } = await shipped(page, sk);

  const first = await fileClaim(page, serials[0]);
  page.once('dialog', d => d.accept());
  await card(page, first).getByRole('button', { name: 'ยกเลิกเคลม' }).click();
  await expect(card(page, first)).toContainText('ยกเลิกแล้ว');

  const second = await fileClaim(page, serials[0], 'มีเสียงดังผิดปกติจากพัดลมตลอดเวลาที่ใช้งาน');
  await sk.goto(`/claims/${second}`);
  await sk.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  await sk.getByRole('dialog').getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }).click();
  await expect(sk.getByRole('dialog').getByText('กรุณาระบุเหตุผลที่ไม่อนุมัติให้ลูกค้าทราบ')).toBeVisible();
  await sk.getByLabel('เหตุผล (ส่งให้ลูกค้าทางอีเมล)').fill('ตรวจพบรอยไหม้จากไฟเกิน ไม่อยู่ในเงื่อนไขการรับประกัน');
  await sk.getByRole('dialog').getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }).click();
  await expect(sk.getByTestId('claim-status')).toHaveText('ไม่อนุมัติ');
  expect((await db.serialNumber.findUniqueOrThrow({ where: { serial: serials[0] } })).status).toBe('sold');
  expect(mails().some(m => m.to === c.email && m.subject === `ผลการเคลม ${second}: ไม่อนุมัติ` && m.text.includes('รอยไหม้'))).toBe(true);

  await page.goto('/account/claims');
  await expect(card(page, second)).toContainText('เหตุผลจากร้าน: ตรวจพบรอยไหม้');
  // The staff filters show it under "ไม่อนุมัติ", not in the open queue.
  await sk.goto('/claims');
  await expect(sk.locator(`tr[data-claim="${second}"]`)).toHaveCount(0);
  await sk.goto(`/claims?tab=rejected&q=${second}`);
  await expect(sk.locator(`tr[data-claim="${second}"]`)).toBeVisible();
  await sk.context().close();
});

test('a unit past its warranty cannot be claimed', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { serials, id } = await shipped(page, sk);
  await db.order.update({ where: { id }, data: { shippedAt: new Date(Date.now() - 4 * 365 * 864e5), paidAt: new Date(Date.now() - 4 * 365 * 864e5) } });
  await page.goto('/account/claims/new');
  await expect(page.getByRole('radio', { name: new RegExp(serials[0]) })).toBeDisabled();
  await expect(page.getByText('หมดประกันแล้ว')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ส่งเรื่องเคลม' })).toBeDisabled();
  await sk.context().close();
});

test('who can open the claim pages', async ({ page }) => {
  await page.goto('/account/claims');
  await expect(page).toHaveURL(/\/account\/login\?next=(%2F|\/)account(%2F|\/)claims/);
  await page.goto('/claims');
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, USERS.executive);
  await page.goto('/claims');
  await expect(page).not.toHaveURL(/\/claims/);
  for (const u of [USERS.storekeeper, USERS.manager, USERS.admin]) {
    await loginAs(page, u);
    await page.goto('/claims');
    await expect(page).toHaveURL(/\/claims$/);
  }
  const res = await page.goto('/claims/CLM-0000-000000');
  expect(res?.status()).toBe(404);
});
