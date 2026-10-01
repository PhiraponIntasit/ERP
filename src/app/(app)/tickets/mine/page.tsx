import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { ticketInclude, ticketView } from '@/server/views';
import { sortTickets } from '@/lib/domain';
import { MyTicketList } from './list';

export default async function MyTicketsPage() {
  const me = await requirePage('my_tickets');
  const tickets = sortTickets(await db.ticket.findMany({ where: { requesterId: me.id }, include: ticketInclude }));
  return <MyTicketList tickets={tickets.map(ticketView)} />;
}
