import { test, expect, type Browser } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, item, paidOrder, product, stamp } from './shop';

// Where A's claims meet B's stock: approving a claim swaps the unit (B's replaceUnit) and closes the claim in ONE
// transaction, so two staff acting at once can never leave a rejected claim with the unit already swapped.

const claims: string[] = [];
test.afterAll(async () => {
  await db.claim.deleteMany({ where: { id: { in: claims } } });
  await cleanupShop();
});

async function staff(browser: Browser, user: string) {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, user);
  return page;
}

/** A shipped serial-tracked unit with a claim the shop has already received. */
async function receivedClaim(page: import('@playwright/test').Page) {
  const s = stamp().toUpperCase(), serials = [`CC-${s}-1`, `CC-${s}-2`, `CC-${s}-3`];
  const sku = await product(4000, 3, serials);
  const { id: orderId, c } = await paidOrder(page, { [sku]: 1 });
  const line = await db.orderLine.findFirstOrThrow({ where: { orderId } });
  await db.serialNumber.update({ where: { serial: serials[0] }, data: { status: 'sold', orderLineId: line.id } });
  await db.order.update({ where: { id: orderId }, data: { status: 'shipped', shippedAt: new Date(), carrier: 'Kerry Express', trackingNo: 'KEX000' } });
  const id = `CLM-E2E-${s}`.slice(0, 30);
  claims.push(id);
  await db.claim.create({ data: { id, customerId: c.id, serial: serials[0], orderId, problem: 'เปิดไม่ติดหลังใช้งานหนึ่งสัปดาห์', status: 'received', receivedAt: new Date() } });
  return { id, sku, serials };
}

test('approve and reject at the same moment: the claim and the stock always agree', async ({ browser, page }) => {
  const { id, sku, serials } = await receivedClaim(page);
  const qty0 = (await item(sku)).qty;
  const [ap, rj] = [await staff(browser, USERS.storekeeper), await staff(browser, USERS.manager)];
  await Promise.all([ap.goto(`/claims/${id}`), rj.goto(`/claims/${id}`)]);
  await ap.locator('#cl-new').fill(serials[1]);
  await rj.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  await rj.locator('#cl-reason').fill('ตรวจพบความเสียหายจากการใช้งานผิดวิธี');
  await Promise.all([
    ap.getByRole('button', { name: 'อนุมัติและเปลี่ยนเครื่อง' }).click(),
    rj.getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }).click(),
  ]);
  await expect.poll(async () => (await db.claim.findUniqueOrThrow({ where: { id } })).status).not.toBe('received');
  await ap.waitForTimeout(1500); // let the losing request finish

  const c = await db.claim.findUniqueOrThrow({ where: { id } });
  const [old, spare] = await Promise.all(serials.slice(0, 2).map(serial => db.serialNumber.findUniqueOrThrow({ where: { serial } })));
  const qty = (await item(sku)).qty;
  if (c.status === 'replaced') {
    expect([old.status, spare.status, c.newSerial, qty]).toEqual(['claim', 'sold', serials[1], qty0 - 1]);
  } else {
    expect(c.status).toBe('rejected');
    expect([old.status, spare.status, qty]).toEqual(['sold', 'in_stock', qty0]); // nothing swapped behind a rejected claim
  }
});

test('a unit with an open claim is swapped from the claim, not from the warranty page', async ({ browser, page }) => {
  const { id, serials } = await receivedClaim(page);
  const sk = await staff(browser, USERS.storekeeper);
  await sk.goto(`/warranty?q=${serials[0]}`);
  await expect(sk.getByRole('status')).toContainText(`ลูกค้าแจ้งเคลมเครื่องนี้แล้ว (${id})`);
  await expect(sk.getByRole('button', { name: 'ยืนยันเปลี่ยนเครื่อง' })).toHaveCount(0);
  await sk.getByRole('link', { name: `ไปที่เคลม ${id}` }).click();
  await expect(sk).toHaveURL(new RegExp(`/claims/${id}$`));
});
