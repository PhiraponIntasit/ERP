import { test, expect, type Page } from '@playwright/test';
import { USERS } from '../helpers';

// After signing in, go back to the page that was asked for (e.g. a shared link to /purchase?page=2),
// but only to the app's own pages that the user may open.

async function signIn(page: Page, username: string) {
  await page.fill('#u', username);
  await page.fill('#p', '1234');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.press('#p', 'Enter')]);
}

test('a signed-out visitor returns to the page they opened, query included', async ({ page }) => {
  await page.goto('/purchase?page=2');
  await expect(page).toHaveURL(/\/login\?next=%2Fpurchase%3Fpage%3D2$/);
  await signIn(page, USERS.admin);
  await expect(page).toHaveURL(/\/purchase\?page=2$/);
});

test('a page the user may not open sends them to their own home page instead', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?next=%2Fusers$/);
  await signIn(page, USERS.itsupport);
  await expect(page).toHaveURL(/\/claims$/);   // a technician's home is their claim queue
});

test('never redirects to another site', async ({ page, baseURL }) => {
  const host = new URL(baseURL!).host;
  for (const next of ['//evil.example.com/purchase', 'https://evil.example.com/purchase', '/\\evil.example.com', 'javascript:alert(1)', '/purchase/../users']) {
    await page.context().clearCookies();
    await page.goto('/login?next=' + encodeURIComponent(next));
    await signIn(page, USERS.itsupport);
    expect(new URL(page.url()).host).toBe(host);
    await expect(page).toHaveURL(/\/claims$/);
  }
});

test('already signed in: /login?next=… goes straight there', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, USERS.itsupport);
  await page.goto('/login?next=' + encodeURIComponent('/claims?tab=mine'));
  await expect(page).toHaveURL(/\/claims\?tab=mine$/);
});
