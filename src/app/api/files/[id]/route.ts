import { db } from '@/server/db';
import { can, getUser } from '@/server/auth';
import { readUpload } from '@/server/uploads';

/** Ticket photos are private: only the requester, dispatchers, and the assigned technician (or Admin) may view them. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;
  const img = await db.ticketImage.findUnique({ where: { id }, include: { ticket: true } });
  const t = img?.ticket;
  const allowed = !!t && (t.requesterId === me.id || can(me, 'dispatch') ||
    (can(me, 'tickets_work') && (t.assigneeId === me.id || (me.role === 'admin' && !!t.assigneeId))));
  if (!img || !allowed) return new Response('Not found', { status: 404 });
  const buf = await readUpload(img.file).catch(() => null);
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' },
  });
}
