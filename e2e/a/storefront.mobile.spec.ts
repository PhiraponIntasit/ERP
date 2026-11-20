import { test, expect } from '@playwright/test';

// Storefront on a phone (Pixel 7 project): nothing wider than the screen, filters scroll sideways,
// two products per row, and the search box is a comfortable size.

for (const path of ['/', '/shop', '/shop?cat=cpu', '/p/cpu-r5-7600', '/account/login', '/account/register', '/build', '/build?cpu=CPU-I5-14400F&mainboard=MB-TUF-B650&pick=ram']) {
  test(`${path} fits the screen`, async ({ page }) => {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('listing: sideways filters, two cards a row, 16px search', async ({ page }) => {
  await page.goto('/shop');
  expect(await page.getByRole('navigation', { name: 'หมวดสินค้า' }).evaluate(e => getComputedStyle(e).overflowX)).toBe('auto');
  const [a, b] = await page.locator('[data-sku]').evaluateAll(cs => cs.slice(0, 2).map(c => c.getBoundingClientRect().top));
  expect(Math.abs(a - b)).toBeLessThan(2);   // same row
  expect(await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).evaluate(e => getComputedStyle(e).fontSize)).toBe('16px');
});

test('cart on a phone: add, then the cart fits with big buttons', async ({ page }) => {
  await page.goto('/p/cpu-r5-7600');
  const buy = page.getByRole('button', { name: 'ใส่ตะกร้า' });
  expect((await buy.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await buy.tap();
  await expect(page.locator('.toast', { hasText: 'ลงตะกร้าแล้ว' })).toBeVisible();
  await page.goto('/cart');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const line = page.locator('[data-sku="CPU-R5-7600"]');
  for (const b of await line.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(39.5);
  await line.getByRole('button', { name: /^ลบ / }).tap();
  await expect(page.getByText('ตะกร้ายังว่างอยู่')).toBeVisible();
});
