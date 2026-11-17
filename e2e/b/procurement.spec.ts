import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

const SUPPLIER = 'บจก. ไอทีซัพพลาย'; // seeded supplier sup-1

// Purchase flow: PR → approval (1 or 2 steps by APPROVAL_LIMIT, default ฿50,000 incl. VAT) → PO → receive into stock.

/** Creates a PR from the purchase page with exactly one line, returns its id. */
async function createPR(page: Page, tag: string, itemName: string, qty: number) {
  await page.goto('/purchase');
  await page.getByRole('button', { name: '+ สร้างใบขอซื้อ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('#pr-s').selectOption({ label: SUPPLIER });
  await dlg.locator('#pr-n').fill(tag);
  for (const input of await dlg.locator('input[aria-label^="จำนวนสั่ง"]').all()) await input.fill(''); // drop pre-filled low-stock lines
  await dlg.getByLabel(`จำนวนสั่ง ${itemName}`).fill(String(qty));
  await dlg.getByRole('button', { name: 'ส่งขออนุมัติ' }).click();
  await expect(dlg).toBeHidden();
  const pr = await db.purchaseRequest.findFirstOrThrow({ where: { note: tag }, include: { lines: true } });
  expect(pr.status).toBe('pending');
  expect(pr.lines.map(l => [l.name, l.qty])).toEqual([[itemName, qty]]);
  return pr.id;
}

const card = (page: Page, id: string) => page.locator('.tcard', { hasText: id });
const row = (page: Page, id: string) => page.locator('tr', { hasText: id });
const status = async (id: string) => (await db.purchaseRequest.findUniqueOrThrow({ where: { id } })).status;

test('small PR: one approval, PO, then receiving adds stock', async ({ page }) => {
  const tag = `E2E small ${Date.now()}`, item = 'HDMI 2.1 Cable 2m', qty = 4;
  await loginAs(page, USERS.storekeeper);
  const id = await createPR(page, tag, item, qty);
  await expect(row(page, id)).toContainText('รอ Manager');

  await loginAs(page, USERS.manager);
  await page.goto('/approvals');
  await card(page, id).getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(card(page, id)).toHaveCount(0);
  expect(await status(id)).toBe('approved');

  await loginAs(page, USERS.storekeeper);
  await page.goto('/purchase');
  await row(page, id).getByRole('button', { name: 'ใบสั่งซื้อ PDF' }).click();
  const po = page.locator('#po-print');
  await expect(po).toContainText('PO' + id.slice(2));
  await expect(po).toContainText(SUPPLIER);
  await expect(po).toContainText('0105551234567'); // supplier tax ID is printed on the PO
  await page.getByRole('button', { name: 'ปิด' }).click();

  const before = (await db.inventoryItem.findFirstOrThrow({ where: { name: item } })).qty;
  await row(page, id).getByRole('button', { name: 'รับเข้าคลัง' }).click();
  await expect(row(page, id).getByRole('button', { name: 'รับเข้าคลัง' })).toHaveCount(0);
  expect(await status(id)).toBe('received');
  expect((await db.inventoryItem.findFirstOrThrow({ where: { name: item } })).qty).toBe(before + qty);
  expect(await db.stockMove.count({ where: { ref: id, type: 'in', qty } })).toBe(1);
});

test('PR over the limit needs Manager then a different Executive', async ({ page }) => {
  const tag = `E2E large ${Date.now()}`;
  await loginAs(page, USERS.storekeeper);
  const id = await createPR(page, tag, 'Dell UltraSharp 27" 4K', 5); // 5 × ฿12,250 cost + VAT > ฿50,000

  await loginAs(page, USERS.manager);
  await page.goto('/approvals');
  await card(page, id).getByRole('button', { name: 'อนุมัติขั้นที่ 1 → ส่งผู้บริหาร' }).click();
  await expect(card(page, id)).toContainText('อนุมัติขั้นที่ 1 โดย');
  expect(await status(id)).toBe('pending_exec');
  await expect(card(page, id).getByRole('button', { name: /^อนุมัติ/ })).toHaveCount(0);
  await expect(card(page, id)).toContainText('รอผู้บริหารอนุมัติขั้นสุดท้าย');

  await loginAs(page, USERS.executive);
  await page.goto('/approvals');
  await card(page, id).getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(card(page, id)).toHaveCount(0);
  const pr = await db.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { approver1: true, approver: true } });
  expect(pr.status).toBe('approved');
  expect(pr.approver1?.username).toBe(USERS.manager);
  expect(pr.approver?.username).toBe(USERS.executive);
});

test('requester cannot approve their own PR', async ({ page }) => {
  const tag = `E2E self ${Date.now()}`;
  await loginAs(page, USERS.admin); // admin has both purchase and approvals
  const id = await createPR(page, tag, 'HDMI 2.1 Cable 2m', 1);
  await page.goto('/approvals');
  await expect(card(page, id)).toContainText('คุณเป็นผู้ขอซื้อใบนี้');
  await expect(card(page, id).getByRole('button')).toHaveCount(0);
});

test('rejecting needs a reason, which the requester then sees', async ({ page }) => {
  const tag = `E2E reject ${Date.now()}`, reason = 'ราคาสูงกว่าผู้ขายรายอื่น';
  await loginAs(page, USERS.storekeeper);
  const id = await createPR(page, tag, 'HDMI 2.1 Cable 2m', 2);

  await loginAs(page, USERS.manager);
  await page.goto('/approvals');
  await card(page, id).getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }).click();
  await expect(dlg).toContainText('กรุณาระบุเหตุผล');
  expect(await status(id)).toBe('pending');
  await dlg.getByLabel('เหตุผล (แจ้งกลับผู้ขอ)').fill(reason);
  await dlg.getByRole('button', { name: 'ยืนยันไม่อนุมัติ' }).click();
  await expect(dlg).toBeHidden();
  expect(await status(id)).toBe('rejected');

  await loginAs(page, USERS.storekeeper);
  await page.goto('/purchase');
  await expect(row(page, id)).toContainText(`เหตุผล: ${reason}`);
  await expect(row(page, id).getByRole('button')).toHaveCount(0);
});
