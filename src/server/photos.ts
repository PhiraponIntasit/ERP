import 'server-only';
import { Fail } from './act';
import { MAX_IMAGE_BYTES, removeUpload, saveUpload, sniffImage } from './uploads';

export type SavedPhoto = { file: string; mime: string; name: string; size: number };

/** Validate (count, size, real image bytes) and store uploaded photos. On failure nothing is left behind. */
export async function savePhotos(raw: FormDataEntryValue[], max: number): Promise<SavedPhoto[]> {
  const files = raw.filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > max) throw new Fail(`แนบรูปได้สูงสุด ${max} รูป`);
  const saved: SavedPhoto[] = [];
  try {
    for (const f of files) {
      if (f.size > MAX_IMAGE_BYTES) throw new Fail('ไฟล์รูปใหญ่เกิน 5 MB');
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = sniffImage(buf);
      if (!mime) throw new Fail('รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP, GIF)');
      saved.push({ file: await saveUpload(buf, mime), mime, name: f.name.slice(0, 120), size: f.size });
    }
  } catch (e) {
    await dropPhotos(saved);
    throw e;
  }
  return saved;
}

export const dropPhotos = (saved: SavedPhoto[]) => Promise.all(saved.map(s => removeUpload(s.file)));
