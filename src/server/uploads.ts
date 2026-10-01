import 'server-only';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

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
  await mkdir(DIR, { recursive: true });
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const file = `${randomBytes(16).toString('hex')}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ DIR, file), buf, { flag: 'wx' });
  return file;
}

const safe = (file: string) => { if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(file)) throw new Error('bad file name'); return path.join(/*turbopackIgnore: true*/ DIR, file); };
export const readUpload = (file: string) => readFile(safe(file));
export const removeUpload = (file: string) => unlink(safe(file)).catch(() => {});
