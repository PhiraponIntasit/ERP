'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from './dialog';
import { CameraIcon } from './category-icons';
import css from './barcode-scanner.module.css';

type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> };
const FORMATS = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix'];

let detectorPromise: Promise<Detector> | null = null;
/** Native BarcodeDetector where the browser has one (Chrome on Android), otherwise the ZXing WebAssembly ponyfill. */
function getDetector(): Promise<Detector> {
  return (detectorPromise ??= (async () => {
    const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        const ok = FORMATS.filter(f => supported.includes(f));
        if (ok.length) return new Native({ formats: ok });
      } catch { /* fall through to the ponyfill */ }
    }
    const m = await import('barcode-detector/ponyfill');
    m.prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? `/api/zxing-reader?v=${m.ZXING_WASM_VERSION}` : prefix + p) } });
    return new m.BarcodeDetector({ formats: FORMATS as never[] }) as Detector;
  })().catch(e => { detectorPromise = null; throw e; }));
}

/** Scanned text → asset tag: printable, single-spaced, upper-case, max 40 chars (the field's limit).
 *  A sticker's QR may hold a link to the register (…/assets?tag=NB-0077) instead of the bare tag. */
export const toTag = (raw: string) => {
  const link = /[?&]tag=([^&#]+)/i.exec(raw);
  if (link) try { raw = decodeURIComponent(link[1].replace(/\+/g, ' ')); } catch { /* keep the raw text */ }
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
};

export function ScanButton({ onScan }: { onScan: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn btn-secondary ${css.btn}`} onClick={() => setOpen(true)} aria-label="สแกนบาร์โค้ด / QR ของทรัพย์สิน">
        <ScanIcon /> สแกน
      </button>
      {open && <ScannerDialog onClose={() => setOpen(false)} onScan={v => { setOpen(false); onScan(v); }} />}
    </>
  );
}

function ScannerDialog({ onClose, onScan }: { onClose: () => void; onScan: (tag: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'live' | 'nocamera'>('starting');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const finish = (raw: string) => {
    const tag = toTag(raw);
    if (!tag || done.current) return;
    done.current = true;
    try { navigator.vibrate?.(80); } catch {}
    onScan(tag);
  };

  // Live camera: rear camera, detect every 250 ms until something reads.
  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, stopped = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setState('nocamera'); setMsg('เปิดกล้องสดไม่ได้ในหน้านี้ (ต้องเข้าเว็บผ่าน HTTPS) — ถ่ายรูปบาร์โค้ดแทนได้'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return stream.getTracks().forEach(t => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState('live');
        const detector = await getDetector();
        const tick = async () => {
          if (stopped || done.current) return;
          try {
            if (v.readyState >= 2) { const r = await detector.detect(v); if (r[0]?.rawValue) return finish(r[0].rawValue); }
          } catch { /* a frame that can't be read — keep going */ }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        if (!stopped) { setState('nocamera'); setMsg('เปิดกล้องไม่ได้ (ไม่ได้อนุญาตให้ใช้กล้อง หรือไม่มีกล้อง) — ถ่ายรูปบาร์โค้ดแทนได้'); }
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: decode a still photo (works without live-camera permission and over plain HTTP).
  const fromPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const [detector, bmp] = await Promise.all([getDetector(), createImageBitmap(file)]);
      const r = await detector.detect(bmp);
      bmp.close();
      if (r[0]?.rawValue) finish(r[0].rawValue);
      else setMsg('ไม่พบบาร์โค้ดในรูป ลองถ่ายให้ใกล้ ตรง และชัดขึ้น');
    } catch { setMsg('อ่านรูปไม่ได้ ลองใหม่อีกครั้ง'); }
    setBusy(false);
  };

  return (
    <Dialog title="สแกนบาร์โค้ด / QR ทรัพย์สิน" onClose={onClose} className={css.dialog}>
      <div className={css.view} data-state={state}>
        <video ref={video} className={css.video} playsInline muted aria-label="ภาพจากกล้อง" />
        {state === 'live' && <div className={css.guide} aria-hidden="true" />}
        {state === 'starting' && <div className={css.overlay}>กำลังเปิดกล้อง…</div>}
        {state === 'nocamera' && <div className={css.overlay}><CameraIcon size={28} /></div>}
      </div>
      <div className="dialog-body" role="status" aria-live="polite">
        {msg || (state === 'live' ? 'เล็งกล้องไปที่บาร์โค้ดหรือ QR บนสติกเกอร์ทรัพย์สิน ระบบจะอ่านให้เอง' : '')}
      </div>
      <div className="dialog-actions" style={{ flexWrap: 'wrap' }}>
        <label className={`btn ${state === 'nocamera' ? 'btn-primary' : 'btn-secondary'}`} aria-disabled={busy}>
          <CameraIcon size={16} /> {busy ? 'กำลังอ่าน…' : 'ถ่ายรูปบาร์โค้ด'}
          <input type="file" accept="image/*" capture="environment" onChange={fromPhoto} disabled={busy} hidden aria-label="ถ่ายรูปบาร์โค้ด" />
        </label>
        <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
      </div>
    </Dialog>
  );
}

const ScanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
  </svg>
);
