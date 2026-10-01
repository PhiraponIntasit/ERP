import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { auditWhere } from '@/server/audit-query';
import { AUDIT_CATS, fmtDT } from '@/lib/domain';
import { AuditToolbar } from './toolbar';

const WARN = /ไม่สำเร็จ|ระงับ|ลบ|ไม่อนุมัติ|ปฏิเสธ/;
const LIMIT = 200;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  await requirePage('audit');
  const sp = await searchParams;
  const cat = sp.cat && AUDIT_CATS[sp.cat] ? sp.cat : 'all', q = (sp.q ?? '').slice(0, 100);
  const where = auditWhere(cat, q);
  const [rows, count, totals, all] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: [{ t: 'desc' }, { id: 'desc' }], take: LIMIT }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ['cat'], _count: true }),
    db.auditLog.count(),
  ]);
  const n = new Map(totals.map(t => [t.cat, t._count]));
  const chips = [{ k: 'all', label: 'ทั้งหมด', n: all }, ...Object.entries(AUDIT_CATS).map(([k, label]) => ({ k, label, n: n.get(k) ?? 0 })).filter(c => c.n > 0)];
  return (
    <div className="anim-page stack-4">
      <p className="lead" style={{ maxWidth: '80ch' }}>ระบบบันทึกทุกการกระทำที่มีผลต่อข้อมูลโดยอัตโนมัติ — ใครทำ ทำอะไร เมื่อไร และค่าเปลี่ยนจากอะไรเป็นอะไร บันทึกนี้อ่านได้อย่างเดียว ไม่มีผู้ใดแก้ไขหรือลบได้ รวมถึง Admin</p>
      <AuditToolbar cat={cat} q={q} chips={chips} />
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th>วันเวลา</th><th>ผู้กระทำ</th><th>หมวด</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead>
          <tbody>
            {rows.map(a => { const warn = WARN.test(a.action); return (
              <tr key={String(a.id)}>
                <td className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDT(a.t)}</td>
                <td style={{ fontSize: 14 }}>{a.by}<div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{a.role}</div></td>
                <td><span className={`tag ${warn ? 'tag-outline' : 'tag-neutral'}`}>{AUDIT_CATS[a.cat] ?? a.cat}</span></td>
                <td style={{ fontSize: 14, color: warn ? 'var(--color-accent-800)' : 'var(--color-text)' }}>{a.action}</td>
                <td className="tnum" style={{ fontSize: 13 }}>{a.target}</td>
                <td style={{ fontSize: 13, color: 'var(--color-neutral-700)', maxWidth: 380 }}>{a.detail}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {count > LIMIT && <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>แสดง {LIMIT} รายการล่าสุดจาก {count} รายการ — ใช้ตัวกรองหรือ Export CSV เพื่อดูทั้งหมด</div>}
    </div>
  );
}
