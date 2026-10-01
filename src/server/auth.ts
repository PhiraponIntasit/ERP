import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { db, type Tx } from './db';
import { ALL, MOD_PATH, ROLE_LABEL, type Module, type Role } from '@/lib/domain';

export const SESSION_COOKIE = 'erp_session';
const SESSION_DAYS = 7;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt,
    // Secure by default in production; set COOKIE_SECURE=false only for plain-HTTP intranet hosts.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Current user, re-read from the DB on every request so suspensions and
 *  permission changes take effect immediately. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return s.user;
});

export const can = (u: User | null, m: Module) => !!(u && u.active && u.perms.includes(m));
export const allowedModules = (u: User) => ALL.filter(m => can(u, m));
export const homePath = (u: User) => { const m = allowedModules(u)[0]; return m ? MOD_PATH[m] : '/login'; };

/** For pages: must be signed in and hold `m`, otherwise bounce. */
export async function requirePage(m: Module): Promise<User> {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!can(u, m)) redirect(homePath(u));
  return u;
}

export class Denied extends Error {}

/** For server actions: must be signed in and hold at least one of `mods`. */
export async function requireAction(...mods: Module[]): Promise<User> {
  const u = await getUser();
  if (!u) throw new Denied('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  if (mods.length && !mods.some(m => can(u, m))) throw new Denied('คุณไม่มีสิทธิ์ทำรายการนี้');
  return u;
}

type Who = Pick<User, 'id' | 'name' | 'role'> | null;
export async function audit(tx: Tx | typeof db, who: Who, cat: string, action: string, target = '', detail = '') {
  await tx.auditLog.create({
    data: { userId: who?.id ?? null, by: who ? who.name : '(ไม่ระบุตัวตน)', role: who ? ROLE_LABEL[who.role as Role] ?? who.role : '—', cat, action, target, detail },
  });
}
