import { db } from '@/server/db';
import { readUpload, sniffImage } from '@/server/uploads';

/** Product photos are public: the storefront shows them to everyone, signed in or not. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = await db.productImage.findUnique({ where: { id } });
  const buf = img ? await readUpload(img.file).catch(() => null) : null;
  const mime = buf && sniffImage(buf);
  if (!buf || !mime) return new Response('Not found', { status: 404 });
  // A photo is never edited in place (a new upload gets a new id), so it can be cached for long
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
