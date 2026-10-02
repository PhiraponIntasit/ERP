import { expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/** Direct DB access for arranging data the UI would take too long to create. Clean up what you add. */
export const db = new PrismaClient();

/** Seeded demo accounts — all use password 1234 (prisma/seed.ts). */
export const USERS = {
  admin: 'admin', manager: 'manager', executive: 'executive', itmanager: 'itmanager',
  itsupport: 'somchai', itsupport2: 'pakorn', storekeeper: 'wiphada', employee: 'surachai', employee2: 'natthida',
} as const;

export async function loginAs(page: Page, username: string, password = '1234') {
  await page.context().clearCookies(); // /login redirects away when already signed in
  await page.goto('/login');
  await page.fill('#u', username);
  await page.fill('#p', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.press('#p', 'Enter')]);
}

/** The pager under a server-paginated table. */
export const pager = (page: Page) => page.getByRole('navigation', { name: 'เปลี่ยนหน้า' });

export async function expectPagerText(page: Page, from: number, to: number, total: number) {
  await expect(pager(page)).toContainText(`แสดง ${from}–${to} จาก ${total} รายการ`);
}
