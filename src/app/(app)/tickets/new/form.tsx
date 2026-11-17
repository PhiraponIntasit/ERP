'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTicket } from '@/server/actions/tickets';
import { useAction } from '@/components/use-action';
import { ImagePlusIcon, XIcon } from '@/components/icons';
import { CameraIcon, CategoryIcon, GalleryIcon, SendIcon } from '@/components/category-icons';
import { CATS, SLA_H, URG, URG_KEYS } from '@/lib/domain';
import css from './form.module.css';
import { ScanButton } from '@/components/barcode-scanner';
import { useToast } from '@/components/toast';
import { MAX_PHOTOS as MAX, shrink, type Img } from '@/components/photo-shrink';

const blank = { cat: 'laptop', urgency: 'medium', title: '', assetTag: '', desc: '' };

export function NewTicketForm({ canSeeMine }: { canSeeMine: boolean }) {
  const router = useRouter();
  const [nt, setNt] = useState(blank);
  const [images, setImages] = useState<Img[]>([]);
  const { run, pending, error, setError } = useAction();
  const toast = useToast();
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

  const slaText = (h: number) => (h < 24 ? `${h} ชั่วโมง` : `${h / 24} วัน`);
  const canAdd = images.length < MAX;

  return (
    <div className={`anim-page stack-6 ${css.form}`}>
      <p className={`lead ${css.lead}`} style={{ maxWidth: '70ch' }}>อธิบายอาการให้ละเอียดที่สุด พร้อมแนบรูปถ่ายประกอบ คำร้องจะส่งถึง IT Manager เพื่อมอบหมายช่าง และคุณติดตามสถานะได้ที่เมนู “คำร้องของฉัน”</p>
      <div className="col" style={{ gap: 10 }}>
        <div className={css.label} id="nt-cat-label">1. ประเภทอุปกรณ์หรือระบบ</div>
        <div className={css.cats} role="group" aria-labelledby="nt-cat-label">
          {CATS.map(([k, l]) => (
            <button key={k} type="button" className={`choice ${css.cat}${nt.cat === k ? ' on' : ''}`} aria-pressed={nt.cat === k} onClick={() => set('cat', k)}>
              <CategoryIcon cat={k} />{l}
            </button>
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 10 }}>
        <div className={css.label} id="nt-urg-label">2. ระดับความเร่งด่วน</div>
        <div className={css.urg} role="group" aria-labelledby="nt-urg-label">
          {URG_KEYS.map(k => <button key={k} type="button" className={`choice sm${nt.urgency === k ? ' on' : ''}`} aria-pressed={nt.urgency === k} onClick={() => set('urgency', k)}>{URG[k][0]}</button>)}
        </div>
        <div className={css.slaHint} aria-live="polite">ทีม IT ตั้งเป้าแก้ไขภายใน {slaText(SLA_H[nt.urgency])} (SLA)</div>
      </div>
      <div className="field"><label htmlFor="nt-title">3. หัวข้อปัญหา</label><input id="nt-title" className="input" value={nt.title} onChange={e => set('title', e.target.value)} maxLength={200} placeholder="เช่น โน้ตบุ๊กเปิดไม่ติด หลังอัปเดต Windows" enterKeyHint="next" /></div>
      <div className="field">
        <label htmlFor="nt-asset">4. รหัสหรือ Serial ของอุปกรณ์ — ถ้ามี</label>
        <div className={css.assetRow}>
          <input id="nt-asset" className="input" value={nt.assetTag} onChange={e => set('assetTag', e.target.value)} maxLength={40} placeholder="พิมพ์หรือกดสแกนบาร์โค้ด / QR" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
          <ScanButton onScan={tag => { set('assetTag', tag); toast(`สแกนได้: ${tag}`); }} />
        </div>
      </div>
      <div className="field"><label htmlFor="nt-desc">5. รายละเอียดอาการที่พบ / สิ่งที่ต้องการให้ซ่อม</label><textarea id="nt-desc" className={`input ${css.desc}`} value={nt.desc} onChange={e => set('desc', e.target.value)} maxLength={5000} placeholder="อธิบายสิ่งที่เกิดขึ้น เกิดเมื่อไร ทำอะไรไปแล้วบ้าง" /></div>
      <div className="col" style={{ gap: 10 }}>
        <div className={css.label}>6. แนบรูปภาพประกอบ <span className="muted">({images.length}/{MAX} รูป)</span></div>
        <div className={css.photos}>
          {images.map((im, k) => (
            <div key={im.src} style={{ position: 'relative' }}>
              <div className={`plate plate-img ${css.thumb}`} title={im.name} style={{ backgroundImage: `url(${im.src})` }} />
              <button type="button" className="img-x" title="ลบรูป" aria-label="ลบรูป" onClick={() => { URL.revokeObjectURL(im.src); setImages(x => x.filter((_, j) => j !== k)); }}><XIcon /></button>
            </div>
          ))}
          {canAdd && (
            <label className={`upload-tile ${css.camera}`}>
              <CameraIcon />
              ถ่ายรูป
              {/* opens the rear camera directly on phones */}
              <input type="file" accept="image/*" capture="environment" onChange={onFiles} className={css.hidden} aria-label="ถ่ายรูป" />
            </label>
          )}
          {canAdd && (
            <label className="upload-tile">
              <span className={css.fineOnly}><ImagePlusIcon />ถ่ายรูป / เลือกไฟล์</span>
              <span className={css.coarseOnly}><GalleryIcon />เลือกจากคลังภาพ</span>
              <input type="file" accept="image/*" multiple onChange={onFiles} className={css.hidden} aria-label="เลือกรูปภาพ" />
            </label>
          )}
        </div>
      </div>
      <div className={`${css.actions}${error ? ' ' + css.withErr : ''}`}>
        {error && <div className={`err ${css.actionsErr}`} role="alert">{error}</div>}
        <button className={`btn btn-primary ${css.submit}`} onClick={submit} disabled={pending}><SendIcon />{pending ? 'กำลังส่ง…' : 'ส่งเรื่องแจ้งซ่อม'}</button>
        <button className="btn btn-secondary" onClick={clear} disabled={pending}>ล้าง<span className={css.fineOnly}>แบบฟอร์ม</span></button>
      </div>
    </div>
  );
}
