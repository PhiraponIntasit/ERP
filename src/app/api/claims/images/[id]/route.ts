import { db } from '@/server/db';
import { can, getUser } from '@/server/auth';
import { getCustomer } from '@/server/customer-session';
import { readUpload } from '@/server/uploads';

/** Claim photos are private: staff with the claims menu, or the customer who owns the claim — and then only their own
 *  photos and those on service-log lines marked for the customer. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = await db.claimImage.findUnique({ where: { id }, include: { claim: { select: { customerId: true } }, event: { select: { public: true } } } });
  if (!img) return new Response('Not found', { status: 404 });
  const staff = await getUser();
  let allowed = !!staff && can(staff, 'claims');
  if (!allowed) {
    const me = await getCustomer();
    allowed = !!me && me.id === img.claim.customerId && (img.kind === 'customer' || !!img.event?.public);
  }
  if (!allowed) return new Response('Not found', { status: 404 });
  const buf = await readUpload(img.file).catch(() => null);
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' },
  });
}
