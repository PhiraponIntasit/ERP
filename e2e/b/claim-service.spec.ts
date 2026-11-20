import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, customer, item, mails, paidOrder, product, stamp } from './shop';

// After-sales service on a claim, storefront and back office together: the customer files with a photo → the shop
// receives and assigns a technician → the technician logs findings (internal and for the customer, with photos) →
// repairs with a spare part from stock and returns the customer's own unit. The customer follows it all on /account/claims.

const PFX = 'E2ESV-';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

test.afterAll(async () => {
  await db.claim.deleteMany({ where: { serial: { startsWith: PFX } } });
  await cleanupShop();
});

/** Signed-in customer on `page` with a shipped order holding serials[0]; serials[1] is a spare in stock. */
async function shipped(page: Page, staff: Page) {
  const s = stamp().toUpperCase(), serials = [`${PFX}${s}-A`, `${PFX}${s}-B`];
  const sku = await product(5200, 2, serials, `E2E เมนบอร์ด ${s}`);
  await db.inventoryItem.update({ where: { sku }, data: { warrantyMonths: 36 } });
  const { id, c } = await paidOrder(page, { [sku]: 1 });
  await staff.goto(`/orders/${id}`);
  await staff.getByRole('button', { name: 'เริ่มแพ็ก' }).click();
  await staff.locator('#sh-carrier').selectOption('Flash Express');
  await staff.locator('#sh-track').fill(`TH${s}`.slice(0, 20));
  await staff.locator(`#sn-${sku}`).fill(serials[0]);
  await staff.getByRole('button', { name: 'ยืนยันจัดส่ง' }).click();
  await expect(staff.getByTestId('order-status')).toHaveText('จัดส่งแล้ว');
  return { serials, c, s };
}

const card = (page: Page, id: string) => page.locator(`[data-claim="${id}"]`);
const log = (page: Page) => page.getByRole('list', { name: 'บันทึกงานเคลม' });

test('customer photo → assign technician → service log the customer can follow → repair with a spare part', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { serials, c, s } = await shipped(page, sk);
  const part = await product(350, 3, undefined, `E2E พัดลม CPU ${s}`);

  // Customer files the claim with a photo of the fault.
  await page.goto('/account/claims/new');
  await page.getByRole('radio', { name: new RegExp(serials[0]) }).check();
  await page.getByLabel('อาการเสีย').fill('เครื่องดับเองหลังเปิด 10 นาที พัดลมมีเสียงดัง');
  await page.locator('#cl-photos').setInputFiles([png('fault.png')]);
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page).toHaveURL(/\/account\/claims\?new=CLM-/);
  const id = new URL(page.url()).searchParams.get('new')!;
  expect(await db.claimImage.count({ where: { claimId: id, kind: 'customer' } })).toBe(1);

  // Shop: the customer's photo is in the log; receive and assign the technician.
  await sk.goto(`/claims/${id}`);
  await expect(log(sk).getByRole('img', { name: 'fault.png' })).toBeVisible();
  await sk.getByRole('button', { name: 'รับเครื่องแล้ว' }).click();
  await expect(sk.getByTestId('claim-status')).toHaveText('ร้านได้รับเครื่อง · กำลังตรวจสอบ');
  const tech = await db.user.findUniqueOrThrow({ where: { username: USERS.itsupport } });
  await sk.getByLabel('ช่างผู้ตรวจสอบ').selectOption(tech.id);
  await sk.getByRole('button', { name: 'มอบหมาย' }).click();
  await expect(log(sk)).toContainText(`มอบหมายให้ ${tech.name} ตรวจสอบ`);

  // Technician: the claim is in "my jobs"; logs an internal finding, then one for the customer with a photo.
  const t = await (await browser.newContext()).newPage();
  await loginAs(t, USERS.itsupport);
  await t.goto('/claims?tab=mine');
  await t.locator(`tr[data-claim="${id}"]`).getByRole('link', { name: id }).click();
  await t.getByLabel('บันทึกผลตรวจ / ความคืบหน้า').fill('ภายใน: ลูกปืนพัดลมแตก สต็อกพัดลมเหลือ 3');
  await t.getByLabel('ให้ลูกค้าเห็นในหน้าเคลม').uncheck();
  await t.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(log(t).locator('li[data-internal="true"]', { hasText: 'ลูกปืนพัดลมแตก' })).toContainText('ภายใน');
  await t.getByLabel('บันทึกผลตรวจ / ความคืบหน้า').fill('ตรวจพบพัดลมระบายความร้อนเสีย จะเปลี่ยนให้');
  await t.getByLabel('ให้ลูกค้าเห็นในหน้าเคลม').check();
  await t.locator('#cl-photos').setInputFiles([png('fan.png')]);
  await t.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(log(t).getByRole('img', { name: 'fan.png' })).toBeVisible();

  // Customer sees the public line and its photo, never the internal one.
  await page.goto('/account/claims');
  await card(page, id).getByText(/ความคืบหน้า/).click();
  const steps = card(page, id).getByRole('list', { name: `ความคืบหน้าเคลม ${id}` });
  await expect(steps).toContainText('ตรวจพบพัดลมระบายความร้อนเสีย');
  await expect(steps).not.toContainText('ลูกปืนพัดลมแตก');
  await expect(steps.getByRole('img', { name: 'fan.png' })).toBeVisible();
  await expect(steps.getByRole('img', { name: 'fault.png' })).toBeVisible();

  // Photos are private: another customer and a signed-out visitor get 404.
  const fan = await db.claimImage.findFirstOrThrow({ where: { claimId: id, name: 'fan.png' } });
  expect((await page.request.get(`/api/claims/images/${fan.id}`)).status()).toBe(200);
  const other = await (await browser.newContext()).newPage();
  await customer(other, {});
  expect((await other.request.get(`/api/claims/images/${fan.id}`)).status()).toBe(404);
  expect((await (await browser.newContext()).request.get(`/api/claims/images/${fan.id}`)).status()).toBe(404);

  // Repair: more parts than in stock is refused, then 1 fan goes out of stock and the claim closes.
  await t.getByRole('radio', { name: 'ซ่อมแล้วคืนเครื่องเดิม' }).click();
  await t.getByLabel('สรุปการซ่อม (ส่งให้ลูกค้า)').fill('เปลี่ยนพัดลมระบายความร้อน ทดสอบ 24 ชม. ปกติ');
  await t.getByRole('button', { name: '+ เพิ่มอะไหล่จากสต็อก' }).click();
  await t.getByLabel('อะไหล่รายการที่ 1', { exact: true }).selectOption(part);
  await t.getByLabel('จำนวนรายการที่ 1', { exact: true }).fill('5');
  await t.getByRole('button', { name: 'ปิดเคลม · ซ่อมคืนเครื่องเดิม' }).click();
  await expect(t.getByText(/เหลือไม่พอ — ใช้ได้ 3/)).toBeVisible();
  expect(await db.claim.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'received' });
  await t.getByLabel('จำนวนรายการที่ 1', { exact: true }).fill('1');
  await t.getByRole('button', { name: 'ปิดเคลม · ซ่อมคืนเครื่องเดิม' }).click();
  await expect(t.getByTestId('claim-status')).toHaveText('ซ่อมเสร็จ · คืนเครื่องเดิม');

  expect(await item(part)).toMatchObject({ qty: 2, reserved: 0 });
  expect(await db.stockMove.findMany({ where: { ref: id }, select: { sku: true, type: true, qty: true } })).toEqual([{ sku: part, type: 'out', qty: 1 }]);
  expect((await db.serialNumber.findUniqueOrThrow({ where: { serial: serials[0] } })).status).toBe('sold');
  expect(await db.claim.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'repaired', newSerial: null, assigneeId: tech.id });
  expect(mails().some(m => m.to === c.email && m.subject === `ผลการเคลม ${id}: ซ่อมเสร็จแล้ว` && m.text.includes(`E2E พัดลม CPU ${s} × 1`))).toBe(true);

  // Customer: repaired, the parts listed, and the same unit can be claimed again later.
  await page.goto('/account/claims');
  await expect(card(page, id)).toContainText('ซ่อมเสร็จ · คืนเครื่องเดิม');
  await expect(card(page, id)).toContainText(`อะไหล่ที่เปลี่ยน: E2E พัดลม CPU ${s} × 1`);
  await page.goto('/account/claims/new');
  await expect(page.getByRole('radio', { name: new RegExp(serials[0]) })).toBeEnabled();
  for (const p of [sk, t, other]) await p.context().close();
});

test('a claim held past the service level shows as overdue; a non-image upload is refused', async ({ page, browser }) => {
  const sk = await (await browser.newContext()).newPage();
  await loginAs(sk, USERS.storekeeper);
  const { serials } = await shipped(page, sk);
  await page.goto('/account/claims/new');
  await page.getByRole('radio', { name: new RegExp(serials[0]) }).check();
  await page.getByLabel('อาการเสีย').fill('ไม่มีภาพออกจอ ไฟเมนบอร์ดกระพริบ');
  await page.locator('#cl-photos').setInputFiles([{ name: 'note.png', mimeType: 'image/png', buffer: Buffer.from('not really an image') }]);
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page.getByText('รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP, GIF)')).toBeVisible();
  expect(await db.claim.count({ where: { serial: serials[0] } })).toBe(0); // nothing filed with a bad file

  await page.locator('#cl-photos').setInputFiles([]);
  await page.getByRole('radio', { name: new RegExp(serials[0]) }).check();
  await page.getByRole('button', { name: 'ส่งเรื่องเคลม' }).click();
  await expect(page).toHaveURL(/\/account\/claims\?new=CLM-/);
  const id = new URL(page.url()).searchParams.get('new')!;
  await db.claim.update({ where: { id }, data: { status: 'received', receivedAt: new Date(Date.now() - 9 * 864e5) } });
  await sk.goto('/claims?tab=received');
  await expect(sk.locator(`tr[data-claim="${id}"]`)).toContainText('เกินกำหนด · รับเครื่องมาแล้ว 9 วัน');
  await sk.goto(`/claims/${id}`);
  await expect(sk.getByTestId('claim-age')).toHaveText('เกินกำหนด · รับเครื่องมาแล้ว 9 วัน');
  await sk.context().close();
});
