import { handleWebhook, SIGNATURE_HEADER } from '@/server/orders';

// Payment provider → shop. Public by design: the HMAC signature (not a session) proves the sender.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 64 * 1024) return Response.json({ ok: false, result: 'too large' }, { status: 413 });
  const r = await handleWebhook(body, req.headers.get(SIGNATURE_HEADER));
  return Response.json(r.body, { status: r.status });
}
