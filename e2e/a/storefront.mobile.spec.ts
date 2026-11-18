import { test, expect } from '@playwright/test';

// Storefront on a phone (Pixel 7 project): nothing wider than the screen, filters scroll sideways,
// two products per row, and the search box is a comfortable size.

for (const path of ['/', '/shop', '/shop?cat=cpu', '/p/cpu-r5-7600', '/account/login', '/account/register']) {
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
