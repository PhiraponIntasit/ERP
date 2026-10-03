import { test, expect, type Page } from '@playwright/test';
import { USERS } from '../helpers';

// After signing in, go back to the page that was asked for (e.g. a QR sticker link to /assets?tag=…),
// but only to the app's own pages that the user may open.

async function signIn(page: Page, username: string) {
  await page.fill('#u', username);
  await page.fill('#p', '1234');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.press('#p', 'Enter')]);
}

test('a signed-out visitor returns to the page they opened, query included', async ({ page }) => {
  await page.goto('/assets?tag=NB-0077');
  await expect(page).toHaveURL(/\/login\?next=%2Fassets%3Ftag%3DNB-0077$/);
  await signIn(page, USERS.admin);
  await expect(page).toHaveURL(/\/assets\?tag=NB-0077$/);
});

test('a page the user may not open sends them to their own home page instead', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?next=%2Fusers$/);
  await signIn(page, USERS.employee);
  await expect(page).toHaveURL(/\/tickets\/new$/);
});

test('never redirects to another site', async ({ page, baseURL }) => {
  const host = new URL(baseURL!).host;
  for (const next of ['//evil.example.com/assets', 'https://evil.example.com/assets', '/\\evil.example.com', 'javascript:alert(1)', '/assets/../users']) {
    await page.context().clearCookies();
    await page.goto('/login?next=' + encodeURIComponent(next));
    await signIn(page, USERS.employee);
    expect(new URL(page.url()).host).toBe(host);
    await expect(page).toHaveURL(/\/tickets\/new$/);
  }
});

test('already signed in: /login?next=… goes straight there', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, USERS.employee);
  await page.goto('/login?next=' + encodeURIComponent('/tickets/mine'));
  await expect(page).toHaveURL(/\/tickets\/mine$/);
});
