import Link from 'next/link';
import type { Page } from '@/lib/paging';

/** Page links for a server-paginated table. Keeps the other query params (`keep`) and doesn't scroll to the top. */
export function Pager({ p, param = 'page', keep = {} }: { p: Page; param?: string; keep?: Record<string, string> }) {
  if (p.total <= p.size) return null;
  const href = (n: number) => {
    const q = new URLSearchParams(keep);
    if (n > 1) q.set(param, String(n)); else q.delete(param);
    return q.size ? `?${q}` : '?';
  };
  const nums = pageNums(p.page, p.pages);
  const from = p.skip + 1, to = Math.min(p.total, p.skip + p.size);
  return (
    <nav aria-label="เปลี่ยนหน้า" style={{ display: 'flex', gap: '8px 16px', alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      <span className="tnum" style={{ color: 'var(--color-neutral-700)' }}>แสดง {from}–{to} จาก {p.total} รายการ</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <Step n={p.page - 1} ok={p.page > 1} href={href} label="‹ ก่อนหน้า" />
        {nums.map((n, i) => n === 0
          ? <span key={'gap' + i} aria-hidden style={{ padding: '0 2px' }}>…</span>
          : <Link key={n} href={href(n)} scroll={false} className={`chip sm tnum${n === p.page ? ' on' : ''}`} style={{ textDecoration: 'none' }} aria-current={n === p.page ? 'page' : undefined}>{n}</Link>)}
        <Step n={p.page + 1} ok={p.page < p.pages} href={href} label="ถัดไป ›" />
      </div>
    </nav>
  );
}

function Step({ n, ok, href, label }: { n: number; ok: boolean; href: (n: number) => string; label: string }) {
  return ok
    ? <Link href={href(n)} scroll={false} className="btn btn-ghost" style={{ textDecoration: 'none' }}>{label}</Link>
    : <span className="btn btn-ghost" aria-disabled style={{ color: 'var(--color-neutral-500)', pointerEvents: 'none' }}>{label}</span>;
}

/** 1 … 4 5 [6] 7 8 … 20 — 0 marks a gap. */
function pageNums(page: number, pages: number): number[] {
  const set = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter(n => n >= 1 && n <= pages));
  const out: number[] = [];
  [...set].sort((a, b) => a - b).forEach((n, i, a) => { if (i && n - a[i - 1] > 1) out.push(0); out.push(n); });
  return out;
}
