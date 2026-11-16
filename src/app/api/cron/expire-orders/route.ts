import { timingSafeEqual } from 'node:crypto';
import { expireDue } from '@/server/orders';

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET". Unpaid orders past their deadline
// are expired here and their held stock released. (Placing an order and the payment page also expire
// due orders on the spot, so stock is freed even between cron runs.)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET is not configured' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? ''), want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, expired: await expireDue() });
}
