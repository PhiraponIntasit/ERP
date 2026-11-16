import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import type { Customer } from '@prisma/client';
import { db } from './db';

// Storefront customer sessions — the primitive checkout needs. Separate cookie and table from staff
// sessions (auth.ts), so a customer can never reach the back office and vice versa.
// Sign-up / sign-in pages (person A) call createCustomerSession after checking the password.

export const CUSTOMER_COOKIE = 'cp_session';
const DAYS = 30;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 864e5);
  await db.customerSession.deleteMany({ where: { customerId, expiresAt: { lt: new Date() } } });
  await db.customerSession.create({ data: { id: sha256(token), customerId, expiresAt } });
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  });
}

export async function destroyCustomerSession() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await db.customerSession.deleteMany({ where: { id: sha256(token) } });
  jar.delete(CUSTOMER_COOKIE);
}

/** The signed-in customer (re-read every request, so a suspended account stops at once), or null. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const s = await db.customerSession.findUnique({ where: { id: sha256(token) }, include: { customer: true } });
  if (!s || s.expiresAt < new Date() || !s.customer.active) return null;
  return s.customer;
});
