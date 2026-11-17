// Copies every uploaded photo (repair tickets and product photos share the `tickets/` prefix) from the Vercel Blob store into a local folder.
// Incremental: files already in the folder are skipped, so it can run daily.
//   BLOB_READ_WRITE_TOKEN=… npm run backup:photos -- ./backup/photos
//   or, for a store connected with OIDC: `npx vercel env pull` (gives BLOB_STORE_ID + VERCEL_OIDC_TOKEN, valid ~12 h), then run it with those
import { list, get } from '@vercel/blob';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || './backup/photos');
if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
  console.error('Set BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + VERCEL_OIDC_TOKEN (npx vercel env pull)'); process.exit(1);
}
await mkdir(dir, { recursive: true });

let cursor, total = 0, copied = 0;
do {
  const page = await list({ prefix: 'tickets/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    total++;
    const out = path.join(dir, path.basename(b.pathname));
    if (await access(out).then(() => true, () => false)) continue;
    const r = await get(b.pathname, { access: 'private' });
    if (!r || r.statusCode !== 200) { console.warn('skip', b.pathname); continue; }
    await writeFile(out, Buffer.from(await new Response(r.stream).arrayBuffer()));
    copied++;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`${total} photos in store, ${copied} new copied to ${dir}`);
