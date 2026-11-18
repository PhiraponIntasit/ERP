import { createHmac, timingSafeEqual } from 'node:crypto';

// Webhook signature, in the style of Stripe/Opn: header `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.body")>`.
// The timestamp is signed too, so an old delivery can't be replayed after the tolerance window.
// (No 'server-only': e2e tests sign their own deliveries with it.)

export const SIGNATURE_HEADER = 'x-corepick-signature';
export const TOLERANCE_S = 300;

export function sign(body: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

export function verify(header: string | null, body: string, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(String(header ?? '').split(',').map(kv => kv.trim().split('=', 2) as [string, string]));
  const t = Number(parts.t), v1 = parts.v1 ?? '';
  if (!Number.isInteger(t) || Math.abs(now - t) > TOLERANCE_S || !/^[0-9a-f]{64}$/.test(v1)) return false;
  const want = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  return timingSafeEqual(want, Buffer.from(v1, 'hex'));
}
