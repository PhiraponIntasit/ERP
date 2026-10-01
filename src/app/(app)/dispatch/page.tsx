import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { techOptions, ticketInclude, ticketView } from '@/server/views';
import { sortTickets } from '@/lib/domain';
import { DispatchBoard } from './board';

export default async function DispatchPage() {
  await requirePage('dispatch');
  const [tickets, techs] = await Promise.all([db.ticket.findMany({ include: ticketInclude }), techOptions()]);
  return <DispatchBoard tickets={sortTickets(tickets).map(ticketView)} techs={techs} />;
}
