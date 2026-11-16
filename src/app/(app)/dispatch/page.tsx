import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { techOptions, ticketInclude, ticketView } from '@/server/views';
import { sortTickets } from '@/lib/domain';
import { canTakeWork } from '@/server/assignable';
import { DispatchBoard } from './board';

export default async function DispatchPage() {
  await requirePage('dispatch');
  const [tickets, techs] = await Promise.all([db.ticket.findMany({ include: ticketInclude }), techOptions()]);
  // Requester phone numbers, so the manager can call back from the card
  const people = await db.user.findMany({ where: { id: { in: [...new Set(tickets.map(t => t.requesterId))] } }, select: { id: true, phone: true } });
  const phoneOf = new Map(people.map(p => [p.id, p.phone]));
  // Assignees who can no longer work the job (suspended or lost the permission) — the manager must reassign
  const assignees = await db.user.findMany({ where: { id: { in: [...new Set(tickets.flatMap(t => t.assigneeId ? [t.assigneeId] : []))] } }, select: { id: true, role: true, active: true, perms: true } });
  const stuck = new Map(assignees.filter(u => !canTakeWork(u)).map(u => [u.id, u.active ? 'ช่างไม่มีสิทธิ์รับงานแล้ว' : 'บัญชีช่างถูกระงับ']));
  return <DispatchBoard tickets={sortTickets(tickets).map(t => ({ ...ticketView(t), phone: phoneOf.get(t.requesterId) ?? '', stuck: t.assigneeId && t.status !== 'closed' ? stuck.get(t.assigneeId) ?? '' : '' }))} techs={techs} />;
}
