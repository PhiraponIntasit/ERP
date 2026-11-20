'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '../db';
import { createCustomerSession, destroyCustomerSession } from '../customer-session';
import { mergeGuestCart } from '../cart';
import { passwordProblem } from '@/lib/password';

// Storefront sign-up / sign-in / sign-out. Customers are their own table with their own session cookie
// (customer-session.ts), so a customer account can never open the back office.

type State = { error: string; values?: Record<string, string> };

// Compared against when the email is unknown, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = '$2b$10$Yee5ByqkJor3C71/w2n6z.guuXTlLPw97EUeCEWJuH52ntC7180X2';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where to go after signing in: a path on this site only (never another host), else the home page. */
function nextPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 300) return '/';
  try {
    const u = new URL(raw, 'http://shop.invalid');
    return u.origin === 'http://shop.invalid' && !u.pathname.startsWith('/account/') ? u.pathname + u.search : '/';
  } catch {
    return '/';
  }
}

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export async function registerCustomer(_prev: State, fd: FormData): Promise<State> {
  const name = text(fd, 'name', 100), email = text(fd, 'email', 200).toLowerCase(), phone = text(fd, 'phone', 20);
  const password = String(fd.get('password') ?? ''), confirm = String(fd.get('confirm') ?? '');
  const values = { name, email, phone };
  if (!name) return { error: 'กรุณากรอกชื่อ-นามสกุล', values };
  if (!EMAIL.test(email)) return { error: 'อีเมลไม่ถูกต้อง', values };
  if (phone && !/^0\d{8,9}$/.test(phone.replace(/[\s-]/g, ''))) return { error: 'เบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678)', values };
  const weak = passwordProblem(password);
  if (weak) return { error: weak, values };
  if (password !== confirm) return { error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', values };
  if (await db.customer.findUnique({ where: { email } })) return { error: 'อีเมลนี้สมัครสมาชิกแล้ว — เข้าสู่ระบบแทน', values };
  const passwordHash = await bcrypt.hash(password, 10);
  let id: string;
  try {
    id = (await db.customer.create({ data: { name, email, phone, passwordHash } })).id;
  } catch {
    return { error: 'อีเมลนี้สมัครสมาชิกแล้ว — เข้าสู่ระบบแทน', values };   // lost a race with a second click
  }
  await createCustomerSession(id);
  await mergeGuestCart(id);
  redirect(nextPath(fd.get('next')));
}

export async function loginCustomer(_prev: State, fd: FormData): Promise<State> {
  const email = text(fd, 'email', 200).toLowerCase(), password = String(fd.get('password') ?? '');
  const c = email ? await db.customer.findUnique({ where: { email } }) : null;
  const ok = await bcrypt.compare(password, c?.passwordHash ?? DUMMY_HASH);
  if (!c || !ok) return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', values: { email } };
  if (!c.active) return { error: 'บัญชีนี้ถูกระงับ กรุณาติดต่อร้าน', values: { email } };
  await createCustomerSession(c.id);
  await mergeGuestCart(c.id);
  redirect(nextPath(fd.get('next')));
}

export async function logoutCustomer() {
  await destroyCustomerSession();
  redirect('/');
}
