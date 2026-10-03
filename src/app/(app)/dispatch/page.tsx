import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { techOptions, ticketInclude, ticketView } from '@/server/views';
import { sortTickets } from '@/lib/domain';
import { DispatchBoard } from './board';

export default async function DispatchPage() {
  await requirePage('dispatch');
  const [tickets, techs] = await Promise.all([db.ticket.findMany({ include: ticketInclude }), techOptions()]);
  // Requester phone numbers, so the manager can call back from the card
  const people = await db.user.findMany({ where: { id: { in: [...new Set(tickets.map(t => t.requesterId))] } }, select: { id: true, employee: { select: { phone: true } } } });
  const phoneOf = new Map(people.map(p => [p.id, p.employee?.phone ?? '']));
  return <DispatchBoard tickets={sortTickets(tickets).map(t => ({ ...ticketView(t), phone: phoneOf.get(t.requesterId) ?? '' }))} techs={techs} />;
}
