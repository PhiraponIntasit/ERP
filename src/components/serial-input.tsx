'use client';
import { ScanButton } from './barcode-scanner';

/** One serial per line — typed, pasted, from a USB barcode scanner (it types + Enter) or the camera scanner. */
export function SerialInput({ id, label, need, value, onChange }: { id: string; label: string; need: number; value: string; onChange: (v: string) => void }) {
  const got = lines(value).length;
  return (
    <div className="field">
      <label htmlFor={id}>{label} <span className="tnum" style={{ color: got === need ? 'var(--color-accent)' : 'var(--color-neutral-700)' }}>({got}/{need})</span></label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea id={id} className="input tnum" rows={Math.min(6, Math.max(2, need))} value={value} onChange={e => onChange(e.target.value)}
          placeholder="สแกนหรือพิมพ์ Serial ทีละบรรทัด" spellCheck={false} autoCapitalize="characters" style={{ flex: 1, fontSize: 13 }} />
        <ScanButton label={`สแกน Serial ${label}`} onScan={v => onChange([...lines(value), v].join('\n'))} />
      </div>
    </div>
  );
}

export const lines = (v: string) => v.split(/[\n,]/).map(x => x.trim()).filter(Boolean);
