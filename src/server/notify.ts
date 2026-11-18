import 'server-only';
import { after } from 'next/server';
import { db } from './db';
import { appUrl, mailConfigured, outboxDir, sendMail } from './mail';
import { URG } from '@/lib/domain';

// Email notifications for the repair-ticket workflow. Each one goes to the address on the recipient's
// employee record, is sent after the response (after()), never notifies the person who did the action,
// and never breaks the action itself if mail fails.

type Ticket = { id: string; title: string; urgency: string };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mail is only attempted where it can go somewhere: SMTP, an outbox folder, or the dev console. */
const enabled = () => mailConfigured() || !!outboxDir() || process.env.NODE_ENV !== 'production';

async function deliver(userIds: string[], actorId: string, subject: string, lines: string[], linkPath: string) {
  const ids = [...new Set(userIds)].filter(id => id && id !== actorId);
  if (!ids.length || !enabled()) return;
  const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { name: true, email: true } });
  const base = appUrl();
  const link = base ? base + linkPath : '';
  for (const u of users) {
    const to = u.email.trim();
    if (!to) continue;
    const text = [`สวัสดีคุณ ${u.name}`, '', ...lines, ...(link ? ['', `เปิดดู: ${link}`] : []), '', '— IT Products Store (อีเมลอัตโนมัติ ไม่ต้องตอบกลับ)'].join('\n');
    const html = `<p>สวัสดีคุณ ${esc(u.name)}</p>${lines.map(l => `<p>${esc(l)}</p>`).join('')}`
      + (link ? `<p><a href="${link}">เปิดดูในระบบ</a></p>` : '') + '<p style="color:#666;font-size:12px">— IT Products Store (อีเมลอัตโนมัติ ไม่ต้องตอบกลับ)</p>';
    try { await sendMail(to, `[IT Products Store] ${subject}`, text, html); }
    catch (e) { console.error('notification email failed', subject, e); }
  }
}

const later = (fn: () => Promise<void>) => after(async () => { try { await fn(); } catch (e) { console.error('notification failed', e); } });
const head = (t: Ticket) => `${t.id} · ${t.title}`;

/** New ticket → everyone who can dispatch (IT Manager, Admin). */
export function notifyNewTicket(t: Ticket, actorId: string, requesterName: string) {
  later(async () => {
    const dispatchers = await db.user.findMany({ where: { active: true, perms: { has: 'dispatch' } }, select: { id: true } });
    await deliver(dispatchers.map(d => d.id), actorId, `คำร้องใหม่ ${head(t)}`,
      [`มีคำร้องแจ้งซ่อมใหม่จาก ${requesterName} รอมอบหมายช่าง`, `${head(t)} · ความเร่งด่วน: ${URG[t.urgency]?.[0] ?? t.urgency}`], '/dispatch');
  });
}

/** Assigned / reassigned → the technician. */
export function notifyAssigned(t: Ticket, actorId: string, techId: string, byName: string) {
  later(() => deliver([techId], actorId, `ได้รับมอบหมายงาน ${head(t)}`,
    [`${byName} มอบหมายงานซ่อมให้คุณ`, `${head(t)} · ความเร่งด่วน: ${URG[t.urgency]?.[0] ?? t.urgency}`], '/work'));
}

/** Technician marked it resolved → the requester, to confirm. */
export function notifyResolved(t: Ticket & { requesterId: string }, actorId: string, techName: string, note: string) {
  later(() => deliver([t.requesterId], actorId, `ซ่อมเสร็จแล้ว รอคุณยืนยัน ${head(t)}`,
    [`${techName} แจ้งว่าแก้ไขงาน ${head(t)} เสร็จแล้ว`, ...(note ? [`บันทึกจากช่าง: ${note}`] : []), 'กรุณาตรวจสอบแล้วกด "ยืนยันปิดงาน" หรือ "ยังไม่หาย" ในเมนูคำร้องของฉัน'], '/tickets/mine'));
}

/** Requester says it's not fixed → the technician. */
export function notifyReopened(t: Ticket & { assigneeId: string | null }, actorId: string, requesterName: string) {
  if (!t.assigneeId) return;
  later(() => deliver([t.assigneeId!], actorId, `ผู้แจ้งแจ้งว่ายังไม่หาย ${head(t)}`,
    [`${requesterName} แจ้งว่าปัญหาใน ${head(t)} ยังไม่หาย งานถูกส่งกลับมาให้คุณดำเนินการต่อ`], '/work'));
}

/** Requester confirmed and rated → the technician. */
export function notifyClosed(t: Ticket & { assigneeId: string | null }, actorId: string, requesterName: string, rating: number, note: string) {
  if (!t.assigneeId) return;
  later(() => deliver([t.assigneeId!], actorId, `ปิดงานแล้ว ${head(t)} · ${rating}/5`,
    [`${requesterName} ยืนยันปิดงาน ${head(t)}`, `คะแนนความพึงพอใจ: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)`, ...(note ? [`ความคิดเห็น: ${note}`] : [])], '/work'));
}
