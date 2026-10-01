'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DownloadIcon } from '@/components/icons';

/** Filters live in the URL so the server can query the (potentially large) log. */
export function AuditToolbar({ cat, q, chips }: { cat: string; q: string; chips: { k: string; label: string; n: number }[] }) {
  const router = useRouter(), path = usePathname();
  const [text, setText] = useState(q);
  const go = (c: string, s: string) => {
    const p = new URLSearchParams();
    if (c !== 'all') p.set('cat', c);
    if (s.trim()) p.set('q', s.trim());
    router.replace(p.size ? `${path}?${p}` : path, { scroll: false });
  };
  useEffect(() => {
    if (text === q) return;
    const id = setTimeout(() => go(cat, text), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const exp = new URLSearchParams({ cat, q: text.trim() });
  return (
    <div className="toolbar">
      <input className="input" style={{ maxWidth: 300 }} value={text} onChange={e => setText(e.target.value)} placeholder="ค้นหาผู้กระทำ, การกระทำ, รายการ" aria-label="ค้นหา Audit Log" />
      {chips.map(c => <button key={c.k} className={`chip sm${cat === c.k ? ' on' : ''}`} aria-pressed={cat === c.k} onClick={() => go(c.k, text)}>{c.label} <span className="tnum">({c.n})</span></button>)}
      {/* plain link: the browser downloads the CSV; the route handler audits the export */}
      <a className="btn btn-secondary ml-auto" href={`/api/audit?${exp}`} download><DownloadIcon /> Export CSV</a>
    </div>
  );
}
