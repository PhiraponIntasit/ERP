import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

// Scan button on "ทะเบียนทรัพย์สิน" (Pixel 7 project). Headless Chromium has no camera here, so the scanner
// falls back to reading a photo (ZXing WebAssembly) — the same path as asset-scan.mobile.spec.ts.
// Creates one asset (E2ESCAN-01 — not "E2E-", which people.spec.ts sweeps away) and deletes it afterwards.
const NEW_TAG = 'E2ESCAN-01';
// Code 128 "E2ESCAN-01" (not in the register)
const UNKNOWN = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAe8AAACWCAAAAADSuF+sAAADpklEQVR4XmP8z4APMIIlgWqADIhKOAOiDZmLqRioBi4IZwMZyEYRbwIjzKXI7oEYC/cFHtOwSiH7Atl8uDjEtcjeh4swwAIH7gY0F8JDFuJgiEaIYmRD4KGBZiCyejQT4IYgOw85qBlwACaGUTCSQmA0vkdWeh+N79H4Hi3hh28IjObv0fw9mr9H8/doGhgeITBano+W56N5ebQ8H00Do+X5aBoYeiEwWn+P1t+j+Xa0/h5NA6P192gaGK2/R9PA4A6B0fbaaHttNI+OttdG08Boe200DYy210bTwGh7bTQNDJ4QGG2fj6zUOBrfo/E9Wv6O9sdG08Bof2w0DYz2x0bTwOAOgdH22mh7bTSPjrbXRtPAaHttNA2MttdG08Boe200DQyeEBhtn4+2z0fz42j7fDQNDI8QGC3PR8vz0bw8Wp6PpoHR8nw0DQy9EBitv0fr79F8O1p/j6aB0fp7NA2M1t+jaWBwh8Boe220vTaaR0fba6NpYLS9NpoGRttro2lgtL02mgYGTwiMts9H2+ej+XG0fT6aBoZHCIyW56Pl+WheHi3PR9PAaHk+mgaGXgiM1t+j9fdovh2tv0fTwGj9PZoGRuvv0TQwuENgtL022l4bzaOj7bXRNDDaXhtNA6PttdE0MNpeG00DgycERtvno+3z0fw42j4fTQPDIwRGy/PR8nw0L4+W56NpYLQ8H00DQy8ERuvv0fp7NN+O1t+jaWC0/h5NA6P192gaGNwhMNpeG22vjebR0fbaaBoYba+NpoHR9tpoGhhtr42mgcETAqPt89H2+Wh+HG2fj6aB4RECo+X5aHk+mpdHy/PRNDBano+mgaEXAqP192j9PZpvR+vv0TQwWn+PpoHR+ns0DQzuEBhtr42210bz6Gh7bTQNjLbXRtPAaHttNA2MttdG08DgCYHR9vlo+3w0P462z0fTwPAIgdHyfLQ8H83Lo+X5aBoYLc9H08DQC4HR+nu0/h7Nt6P192gaGK2/R9PAaP09mgYGdwiMttdG22ujeXS0vTaaBkbba6NpYLS9NpoGRttro2lg8ITAaPt8tH0+mh9H2+ejaWB4hMBoeT5ano/m5dHyfDQNjJbno2lg6IXAaP09Wn+P5tvR+ns0DYzW36NpYLT+Hk0DgzsERttro+210Tw62l4bTQOj7bXRNDDaXhtNA6PttdE0MHhCYLR9Pto+H82Po+3z0TQwPEJgtDwfLc9H8/JoeT6aBkbL89E0MPRCAACAmCortksyPQAAAABJRU5ErkJggg==', 'base64');
// QR holding a link to this page for the seeded NB-0077: https://erp.example.com/assets?tag=NB-0077
const LINK_QR = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAG8AAABvCAAAAADHrsG8AAACq0lEQVR4XmP8z0BXwMQwah81Q2A0PKmbnkbDczQ8SQkBFmTFjNh0QgpYiBS8sAVykcWB+tC4yCYhF9HDPX2yoAUhWvWEHMJAKTgXmQ0JTHgI4zEBqHKkhSfQy8iBhplgkYMLEqpoYYvfhBEYngx4AVo6hAQv8Y2u0fCEhC48EcLLSeRkORqesDTIgj9HQ2QhaRISgPCKCblohSdaeODjSuMjLX0y4s7skEDDTyIXnlhNGu7hSWx/EzkY4YFGRpYfUekTuVWJXGCiZWdgeKIVp8jFAqZi5IQ60tInvHiEJEJ4iwgeJvACAbliQs7mmOLItdUIzO/ICQw59JBTLzyJImd5iCA8rWKtm0ZgfoenScxaG1deRk6B8BTOiK1CGlHpEzmzw5MZPP/Cgwc5wOEJFVkWuaxATrRA9ggsP3HVNWjZGS2c4Ul0tD6CJy20HIocsJBQwhpWaFKY2Xwk1Ucs2Ao5BuQ6Gjl80MThAQ5RAw9tXCXwCMjv2Pub8DBEDih4OoQXj5C4gIcqctT8Z8AORvtHyNkZLa3iyunw9IkW8iMgfaL0N+EZFjkpwhMhhAEJUszKCC1sMRVDREZU+xMtkyJX2ViTItacDo8UrBl+BLbnsSZO5JyOnESREypcDda0OmLTJySIkNMqriIUOWCBwYWcnkfzO6TuwMykwFDCmq+Ry1W4AuTMjlwrwY0dUfkdOY0hJzB4KDEyYAFoYYisERJHyEl9pIUnciqFhwO8kIQnOWAYYhaSyKGNXK4ix8EIDE/MJIiZPtGqIUiZAE+NkNCGmPMf1bjR8ASGB3KyhLORxeFhhhZ6yIohakZgeP7HVkhCQgYug1xmQgSRsz/cBExlIy088dQ48CCFM9AUw4MUa04fGelzdD0tA1XBcM9/o/4bTS+khMBwTy8Amr3I64uyYHsAAAAASUVORK5CYII=', 'base64');

const cleanup = () => db.asset.deleteMany({ where: { tag: NEW_TAG } });
test.beforeAll(cleanup);
test.afterAll(cleanup);

async function scanPhoto(page: Page, png: Buffer) {
  await page.getByRole('button', { name: /สแกนบาร์โค้ด/ }).tap();
  const scanner = page.getByRole('dialog').filter({ hasText: 'สแกนบาร์โค้ด / QR' });
  await scanner.locator('input[aria-label="ถ่ายรูปบาร์โค้ด"]').setInputFiles({ name: 'tag.png', mimeType: 'image/png', buffer: png });
  await expect(scanner).toBeHidden({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => { await loginAs(page, USERS.admin); await page.goto('/assets'); });

test('the scan button sits next to search and is a comfortable tap target', async ({ page }) => {
  const [search, scan] = [await page.getByLabel('ค้นหาอุปกรณ์').boundingBox(), await page.getByRole('button', { name: /สแกนบาร์โค้ด/ }).boundingBox()];
  expect(Math.abs(search!.y + search!.height / 2 - (scan!.y + scan!.height / 2))).toBeLessThan(4);   // same row
  expect(scan!.height).toBeGreaterThanOrEqual(43.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('scanning a registered asset (QR with a link) opens its details', async ({ page }) => {
  await scanPhoto(page, LINK_QR);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('NB-0077');
  await expect(dlg).toContainText('ประวัติการถือครอง');
});

test('scanning an unknown sticker offers to register it with the tag filled in', async ({ page }) => {
  await scanPhoto(page, UNKNOWN);
  const dlg = page.getByRole('dialog').filter({ hasText: 'ลงทะเบียนอุปกรณ์' });
  await expect(dlg.getByRole('status')).toContainText(`ไม่พบ ${NEW_TAG} ในทะเบียน`);
  await expect(dlg.getByLabel('Asset Tag')).toHaveValue(NEW_TAG);
  await dlg.getByLabel('รุ่น').fill('E2E Scanner Test');
  await dlg.getByRole('button', { name: 'บันทึก' }).tap();
  await expect(dlg).toBeHidden();
  expect((await db.asset.findUniqueOrThrow({ where: { tag: NEW_TAG } })).model).toBe('E2E Scanner Test');
  await expect(page.locator('tr', { hasText: NEW_TAG })).toBeVisible();
});

test('a link to /assets?tag=… opens that asset straight away', async ({ page }) => {
  await page.goto('/assets?tag=nb-0077');
  await expect(page.getByRole('dialog')).toContainText('NB-0077');
  await page.goto('/assets?tag=NOPE-404');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
