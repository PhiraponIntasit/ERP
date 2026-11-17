import { can, requirePage } from '@/server/auth';
import { NewTicketForm } from './form';

export default async function NewTicketPage() {
  const me = await requirePage('ticket_new');
  return <NewTicketForm canSeeMine={can(me, 'my_tickets')} />;
}
