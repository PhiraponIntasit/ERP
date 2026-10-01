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
  return <WorkList tickets={sortTickets(tickets).map(ticketView)} inv={inv} showAssignee={isAdmin} />;
}
