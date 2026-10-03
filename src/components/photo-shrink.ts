'use client';

/** A photo picked on the client, ready to upload. */
export type Img = { src: string; name: string; blob: Blob };
/** Photos per upload — the same limit as MAX_IMAGES on the server. */
export const MAX_PHOTOS = 6;

/** Downscale to ≤1000px and re-encode as JPEG — keeps uploads small and strips EXIF. */
export function shrink(file: File): Promise<Img | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b ? { src: URL.createObjectURL(b), name: file.name, blob: b } : null), 'image/jpeg', 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
