import { test, expect, type Page } from '@playwright/test';
import { loginAs, USERS } from '../helpers';

// Barcode scanner on the warranty lookup (Pixel 7 project; the same scanner fills serials when packing orders). Headless Chromium on Linux has no native
// BarcodeDetector, so these tests exercise the ZXing WebAssembly fallback served from /api/zxing-reader.

// Code 128 barcode "NB-0077" as a photo.
const CODE128 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAWsAAACWCAAAAAA9VvbXAAAC1ElEQVR4XmP8z4APMIIlgWqADIhKOAOiDcJlhJkBNw1TI1AJsmJklXCTgWogdjHA7EXThaYAmQvXiGYaxAQGJBcyorLRfIesEs12NN/BbUezmgEHYGIYBfQKgdGwpl9aGw3r0bAejiXbaLoeTdej6Xq0zUJJCIyWIaNlyGgZMlqGjJYhQyMNjJbXo+X1aHk9Wl6Pltej5fVoLkANgdG6cbRuHK0bR0uF0bpxtG4czQWjdeNApYHRdshoO2S0HTJaAo+2Q0bbIaO5YLQdMtoOGf65YLTNN9rmG23zjdZ2o22+0TbfaC4YbfONtvlG23yj5QD1QmC0fT3avh5tX4+WKJSEwGgZMlqGjJYho2XIaBky2kcfzQWoITBaN47WjaN142ipMFo3jtaNo7lgtG4cqDQw2g4ZbYeMtkNGS+DRdshoO2Q0F4y2Q0bbIcM/F4y2+UbbfKNtvtHabrTNN9rmG80Fo22+0TbfaJtvtBygXgiMtq9H29ej7evREoWSEBgtQ0bLkNEyZLQMGS1DhkYaGC2vR8vr0fJ6tLweLa9Hy+vRXIAaAqN142jdOFo3jpYKo3XjaN04mgtG68aBSgOj7ZDRdshoO2S0BB5th4y2Q0ZzwWg7ZLQdMvxzwWibb7TNN9rmG63tRtt8o22+0Vww2uYbbfONtvlGywHqhcBo+5p+qWk0rEfDerQvM1p6j/ZlRvsyo7kANQRG68bRunG0bhwtFUbrxtG6cTQXjNaNA5UGRtsho+2Q0XbIaAk82g4ZbYeM5oLRdshoO2T454LRNt9om2+0zTda2422+UbbfKO5YLTNN9rmG23zjZYD1AuB0fb1aPt6tH09WqJQEgKjZchoGTJahoyWIaNlyNBIA6Pl9Wh5PVpej5bXo+X1aHk9mgtQQ2C0bhytG0frxtFSYbRuHK0bR3PBaN04UGlgtB0y2g4ZbYeMlsCj7ZDRdshoLkANAQBPdh4ruaV4lQAAAABJRU5ErkJggg==', 'base64');
const NOT_A_BARCODE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function openScanner(page: Page) {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/warranty');
  await page.getByRole('button', { name: 'สแกน Serial' }).tap();
  return page.getByRole('dialog');
}

test('the decoder WebAssembly is served by the app itself', async ({ request }) => {
  const r = await request.get('/api/zxing-reader?v=test');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('application/wasm');
  expect((await r.body()).subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d])); // "\0asm"
});

test.describe('no camera available', () => {
  test('falls back to reading a photo of the barcode', async ({ page }) => {
    const dlg = await openScanner(page);
    await expect(dlg.getByRole('status')).toContainText('ถ่ายรูปบาร์โค้ดแทนได้');

    await dlg.locator('input[aria-label="ถ่ายรูปบาร์โค้ด"]').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: NOT_A_BARCODE });
    await expect(dlg.getByRole('status')).toContainText('ไม่พบบาร์โค้ด');

    await dlg.locator('input[aria-label="ถ่ายรูปบาร์โค้ด"]').setInputFiles({ name: 'tag.png', mimeType: 'image/png', buffer: CODE128 });
    await expect(dlg).toBeHidden({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/warranty\?q=NB-0077$/);   // the scanned serial is looked up
  });

  test('cancel leaves the field as it was', async ({ page }) => {
    const dlg = await openScanner(page);
    await dlg.getByRole('button', { name: 'ยกเลิก' }).tap();
    await expect(dlg).toBeHidden();
    await expect(page).toHaveURL(/\/warranty$/);
  });
});
