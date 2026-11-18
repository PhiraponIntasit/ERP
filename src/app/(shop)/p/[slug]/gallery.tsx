'use client';
import { useState } from 'react';
import { NoPicture } from '../../product-card';
import css from '../../storefront.module.css';

export function Gallery({ images, name, category }: { images: { id: string; src: string }[]; name: string; category: string }) {
  const [i, setI] = useState(0);
  const cur = images[i];
  return (
    <div className={css.gallery}>
      <div className={css.mainPic} style={cur ? { backgroundImage: `url(${cur.src})` } : undefined} role="img" aria-label={cur ? `รูปสินค้า ${name}` : `ยังไม่มีรูปสินค้า ${name}`}>
        {!cur && <NoPicture label={category} size={72} />}
      </div>
      {images.length > 1 && (
        <div className={css.thumbs} role="group" aria-label="รูปสินค้า">
          {images.map((im, k) => (
            <button key={im.id} type="button" className={css.thumb} style={{ backgroundImage: `url(${im.src})` }}
              aria-pressed={k === i} aria-label={`รูปที่ ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </div>
  );
}
