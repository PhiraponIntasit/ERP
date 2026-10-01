import 'server-only';
import { refresh } from 'next/cache';
import { Denied } from './auth';
import type { Result } from '@/lib/result';

/** A user-facing validation failure (message is shown as-is). */
export class Fail extends Error {}

/** Wrap a server action body: refresh the router on success, turn expected failures into a Result. */
export async function act(fn: () => Promise<string | void>): Promise<Result> {
  try {
    const msg = await fn();
    refresh();
    return { ok: true, msg: msg || undefined };
  } catch (e) {
    if (e instanceof Denied || e instanceof Fail) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

export const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
export const int = (v: unknown) => { const n = parseInt(str(v), 10); return Number.isFinite(n) ? n : NaN; };
