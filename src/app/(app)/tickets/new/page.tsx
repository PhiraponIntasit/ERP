import { db } from '@/server/db';
import { can, requirePage } from '@/server/auth';
import { NewTicketForm } from './form';

export default async function NewTicketPage() {
  const me = await requirePage('ticket_new');
  const myAssets = me.empId ? await db.asset.findMany({ where: { holderId: me.empId }, orderBy: { tag: 'asc' }, select: { tag: true, model: true } }) : [];
  return <NewTicketForm myAssets={myAssets} canSeeMine={can(me, 'my_tickets')} />;
}
