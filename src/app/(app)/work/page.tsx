import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { ticketInclude, ticketView } from '@/server/views';
import { sortTickets } from '@/lib/domain';
import { WorkList } from './list';

export default async function WorkPage() {
  const me = await requirePage('tickets_work');
  const isAdmin = me.role === 'admin';
  const [tickets, inv] = await Promise.all([
    db.ticket.findMany({ where: { status: { not: 'closed' }, ...(isAdmin ? { assigneeId: { not: null } } : { assigneeId: me.id }) }, include: ticketInclude }),
    db.inventoryItem.findMany({ where: { qty: { gt: 0 } }, orderBy: { sku: 'asc' }, select: { sku: true, name: true, qty: true, unit: true } }),
  ]);
  // Requester phone numbers, so the technician can call from the job card
  const people = await db.user.findMany({ where: { id: { in: [...new Set(tickets.map(t => t.requesterId))] } }, select: { id: true, employee: { select: { phone: true } } } });
  const phoneOf = new Map(people.map(p => [p.id, p.employee?.phone ?? '']));
  return <WorkList tickets={sortTickets(tickets).map(t => ({ ...ticketView(t), phone: phoneOf.get(t.requesterId) ?? '' }))} inv={inv} showAssignee={isAdmin} />;
}
