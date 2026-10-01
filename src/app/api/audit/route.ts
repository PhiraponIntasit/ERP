import { db } from '@/server/db';
import { audit, can, getUser } from '@/server/auth';
import { auditWhere } from '@/server/audit-query';
import { AUDIT_CATS, DISPLAY_TZ } from '@/lib/domain';

/** CSV export of the (filtered) audit log. The export itself is audited. */
export async function GET(req: Request) {
  const me = await getUser();
  if (!me || !can(me, 'audit')) return new Response('Forbidden', { status: 403 });
  const u = new URL(req.url);
  const rows = await db.auditLog.findMany({ where: auditWhere(u.searchParams.get('cat') ?? 'all', u.searchParams.get('q') ?? ''), orderBy: [{ t: 'desc' }, { id: 'desc' }] });
  const cell = (c: string) => {
    const v = /^[=+\-@\t\r]/.test(c) ? "'" + c : c; // neutralise spreadsheet formula injection
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const lines = [['วันเวลา', 'ผู้กระทำ', 'บทบาท', 'หมวด', 'การกระทำ', 'รายการ', 'รายละเอียด'],
    ...rows.map(a => [a.t.toLocaleString('th-TH', { timeZone: DISPLAY_TZ }), a.by, a.role, AUDIT_CATS[a.cat] || a.cat, a.action, a.target, a.detail])];
  const csv = '﻿' + lines.map(r => r.map(cell).join(',')).join('\r\n');
  await audit(db, me, 'system', 'Export Audit Log', 'CSV', rows.length + ' รายการ');
  const day = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-log-${day}.csv"`, 'Cache-Control': 'no-store' } });
}
