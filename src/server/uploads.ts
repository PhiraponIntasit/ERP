import 'server-only';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { put, get, del } from '@vercel/blob';

/** On Vercel the filesystem is read-only, so photos go to a private Vercel Blob store when one is connected; otherwise to UPLOAD_DIR.
 *  Newer stores connect with BLOB_STORE_ID (+ Vercel's OIDC token, which @vercel/blob picks up itself); older ones with BLOB_READ_WRITE_TOKEN. */
const BLOB = !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
// Prefix kept from the retired helpdesk so photos already stored stay reachable; claim and product photos use it too.
const blobPath = (file: string) => `tickets/${file}`;
const DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || './storage/uploads');
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Identify an image by its magic bytes — never trust the client's MIME type. */
export function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif';
  return null;
}

export async function saveUpload(buf: Buffer, mime: string) {
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const file = `${randomBytes(16).toString('hex')}.${ext}`;
  if (BLOB) {
    await put(blobPath(file), buf, { access: 'private', contentType: mime, addRandomSuffix: false, allowOverwrite: false });
    return file;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ DIR, file), buf, { flag: 'wx' });
  return file;
}

const safe = (file: string) => { if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(file)) throw new Error('bad file name'); return path.join(/*turbopackIgnore: true*/ DIR, file); };

export async function readUpload(file: string): Promise<Buffer> {
  const p = safe(file);
  if (!BLOB) return readFile(p);
  const r = await get(blobPath(file), { access: 'private' });
  if (!r || r.statusCode !== 200) throw new Error('not found');
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

export async function removeUpload(file: string) {
  const p = safe(file);
  await (BLOB ? del(blobPath(file)) : unlink(p)).catch(() => {});
}
