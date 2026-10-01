'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTicket } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { ImagePlusIcon, XIcon } from '@/components/icons';
import { CATS, URG, URG_KEYS } from '@/lib/domain';

type Img = { src: string; name: string; blob: Blob };
const MAX = 6;

/** Downscale to ≤1000px and re-encode as JPEG — keeps uploads small and strips EXIF. */
function shrink(file: File): Promise<Img | null> {
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

const blank = { cat: 'laptop', urgency: 'medium', title: '', assetTag: '', desc: '' };

export function NewTicketForm({ myAssets, canSeeMine }: { myAssets: { tag: string; model: string }[]; canSeeMine: boolean }) {
  const router = useRouter();
  const [nt, setNt] = useState(blank);
  const [images, setImages] = useState<Img[]>([]);
  const { run, pending, error, setError } = useAction();
  const set = (k: keyof typeof blank, v: string) => setNt(x => ({ ...x, [k]: v }));

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]; e.target.value = '';
    const out = (await Promise.all(files.slice(0, MAX - images.length).map(shrink))).filter((x): x is Img => !!x);
    setImages(cur => [...cur, ...out].slice(0, MAX));
  };
  const clear = () => { images.forEach(i => URL.revokeObjectURL(i.src)); setImages([]); setNt(blank); setError(''); };
  const submit = () => {
    if (!nt.title.trim() || !nt.desc.trim()) return setError('กรุณากรอกหัวข้อและรายละเอียดปัญหา');
    const fd = new FormData();
    Object.entries(nt).forEach(([k, v]) => fd.append(k, v));
    images.forEach((im, i) => fd.append('images', im.blob, (im.name.replace(/\.[^.]+$/, '') || 'photo' + i) + '.jpg'));
    run(() => createTicket(fd), () => { clear(); if (canSeeMine) router.push('/tickets/mine'); });
  };

  return (
    <div className="anim-page stack-6" style={{ maxWidth: 900 }}>
      <p className="lead" style={{ maxWidth: '70ch' }}>อธิบายอาการให้ละเอียดที่สุด พร้อมแนบรูปถ่ายประกอบ คำร้องจะส่งถึง IT Manager เพื่อมอบหมายช่าง และคุณติดตามสถานะได้ที่เมนู “คำร้องของฉัน”</p>
      <div className="col" style={{ gap: 10 }}>
        <div style={{ fontSize: 13 }}>1. ประเภทอุปกรณ์หรือระบบ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {CATS.map(([k, l]) => <button key={k} type="button" className={`choice${nt.cat === k ? ' on' : ''}`} aria-pressed={nt.cat === k} onClick={() => set('cat', k)}>{l}</button>)}
        </div>
      </div>
      <div className="col" style={{ gap: 10 }}>
        <div style={{ fontSize: 13 }}>2. ระดับความเร่งด่วน</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {URG_KEYS.map(k => <button key={k} type="button" className={`choice sm${nt.urgency === k ? ' on' : ''}`} aria-pressed={nt.urgency === k} onClick={() => set('urgency', k)}>{URG[k][0]}</button>)}
        </div>
      </div>
      <div className="field"><label htmlFor="nt-title">3. หัวข้อปัญหา</label><input id="nt-title" className="input" value={nt.title} onChange={e => set('title', e.target.value)} maxLength={200} placeholder="เช่น โน้ตบุ๊กเปิดไม่ติด หลังอัปเดต Windows" /></div>
      <div className="field">
        <label htmlFor="nt-asset">4. รหัสทรัพย์สิน (Asset Tag) — ถ้ามี</label>
        <input id="nt-asset" className="input" value={nt.assetTag} onChange={e => set('assetTag', e.target.value)} maxLength={40} placeholder="เช่น NB-0077" />
        {myAssets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>อุปกรณ์ที่คุณถือครอง:</span>
            {myAssets.map(a => <button key={a.tag} type="button" className="tag tag-outline" style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => set('assetTag', a.tag)}>{a.tag} · {a.model}</button>)}
          </div>
        )}
      </div>
      <div className="field"><label htmlFor="nt-desc">5. รายละเอียดอาการที่พบ / สิ่งที่ต้องการให้ซ่อม</label><textarea id="nt-desc" className="input" style={{ minHeight: 130 }} value={nt.desc} onChange={e => set('desc', e.target.value)} maxLength={5000} placeholder="อธิบายสิ่งที่เกิดขึ้น เกิดเมื่อไร ทำอะไรไปแล้วบ้าง" /></div>
      <div className="col" style={{ gap: 10 }}>
        <div style={{ fontSize: 13 }}>6. แนบรูปภาพประกอบ <span className="muted">(สูงสุด 6 รูป)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {images.map((im, k) => (
            <div key={im.src} style={{ position: 'relative' }}>
              <div className="plate plate-img" title={im.name} style={{ width: '100%', aspectRatio: '4/3', backgroundImage: `url(${im.src})` }} />
              <button type="button" className="img-x" title="ลบรูป" aria-label="ลบรูป" onClick={() => { URL.revokeObjectURL(im.src); setImages(x => x.filter((_, j) => j !== k)); }}><XIcon /></button>
            </div>
          ))}
          {images.length < MAX && (
            <label className="upload-tile">
              <ImagePlusIcon />
              ถ่ายรูป / เลือกไฟล์
              <input type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
            </label>
          )}
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-4)' }}>
        <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 16 }} onClick={submit} disabled={pending}>ส่งเรื่องแจ้งซ่อม</button>
        <button className="btn btn-secondary" onClick={clear} disabled={pending}>ล้างแบบฟอร์ม</button>
      </div>
    </div>
  );
}
