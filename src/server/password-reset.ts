import 'server-only';
import { createHash } from 'node:crypto';
import { db } from './db';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A reset link is valid when it exists, is unused and unexpired, and the account is still active.
 *  Server-only on purpose: it returns the user row, so it must never be callable as a server action. */
export async function findValidReset(token: string) {
  if (!token || token.length > 100) return null;
  const r = await db.passwordReset.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  return r && !r.usedAt && r.expiresAt > new Date() && r.user.active ? r : null;
}
