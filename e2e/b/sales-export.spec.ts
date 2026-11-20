import { test, expect } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';
import { cleanupShop, paidOrder, product } from './shop';

// Sales report CSV: one row per paid order (VAT split, cost, gross profit) and one per product. The totals equal the
// figures on /sales for the same period, the export is audited, and only people with the report may download it.

test.afterAll(cleanupShop);

/** Minimal CSV reader for the quoted cells we write (UTF-8 BOM, CRLF). */
const parse = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map(m => (m[1] ?? m[2]).replace(/""/g, '"')));
const baht = (s: string) => Number(s.replace(/[^\d.]/g, ''));

test('order and product CSVs match the report on screen', async ({ page, browser }) => {
  const sku = await product(3210, 2);
  const { id } = await paidOrder(await (await browser.newContext()).newPage(), { [sku]: 1 });
  await loginAs(page, USERS.manager);
  await page.goto('/sales?p=7d');
  const revenue = baht(await page.getByTestId('sales-kpis').locator('.kpi', { hasText: 'ยอดขาย' }).first().locator('.kpi-value').innerText());
  const profit = baht(await page.getByTestId('gross-profit').innerText());

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'CSV รายคำสั่งซื้อ' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^sales-orders-7d-\d{4}-\d{2}-\d{2}\.csv$/);
  const rows = parse(await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8')));
  const [head, ...data] = rows;
  expect(head).toEqual(['เลขที่คำสั่งซื้อ', 'วันเวลาที่ชำระ', 'สถานะ', 'ลูกค้า', 'อีเมล', 'จำนวนชิ้น', 'ยอดสินค้า', 'ส่วนลด', 'คูปอง', 'ค่าส่ง', 'ยอดรวม (รวม VAT)', 'ฐานภาษี', 'VAT 7%', 'ต้นทุนสินค้า', 'กำไรขั้นต้น']);
  const mine = data.find(r => r[0] === id)!;
  expect(mine.slice(5)).toEqual(['1', '3210', '0', '', '0', '3210', '3000', '210', '1605', '1395']); // cost = price/2 (test product)
  const sum = (col: number) => Math.round(data.reduce((a, r) => a + Number(r[col]), 0));
  expect(sum(10)).toBe(Math.round(revenue));   // same revenue as the KPI
  expect(sum(14)).toBe(Math.round(profit));    // same gross profit

  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'CSV รายสินค้า' }).click()]);
  const prod = parse(await (await dl2.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8')));
  expect(prod[0]).toEqual(['SKU', 'สินค้า', 'จำนวนที่ขาย', 'ยอดขาย (รวม VAT)', 'กำไรขั้นต้น']);
  expect(prod.find(r => r[0] === sku)!.slice(2)).toEqual(['1', '3210', '1395']);

  expect(await db.auditLog.count({ where: { action: 'Export รายงานยอดขาย', by: { contains: '' }, detail: { contains: '7 วัน' } } })).toBeGreaterThanOrEqual(2);
});

test('only roles with the sales report can export', async ({ page }) => {
  await loginAs(page, USERS.storekeeper);
  expect((await page.request.get('/api/sales/export?p=7d')).status()).toBe(403);
  await loginAs(page, USERS.executive);
  expect((await page.request.get('/api/sales/export?p=7d&kind=products')).status()).toBe(200);
});
