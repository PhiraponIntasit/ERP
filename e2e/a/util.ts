import type { Browser, Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { db, loginAs } from '../helpers';

/** Each user gets their own browser context (own cookies), so several people can act in one test. */
export async function as(browser: Browser, username: string, password = '1234'): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, username, password);
  return page;
}

/** A throwaway account, so tests never touch the seeded demo users. Remove with dropUsers(). */
export async function makeUser(username: string, password: string, role = 'employee', perms = ['ticket_new', 'my_tickets']) {
  return db.user.create({ data: { username, name: 'ทดสอบ ' + username, role, perms, passwordHash: await bcrypt.hash(password, 10) } });
}
export const dropUsers = (prefix: string) => db.user.deleteMany({ where: { username: { startsWith: prefix } } });

/** A 1×1 PNG for photo uploads. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
