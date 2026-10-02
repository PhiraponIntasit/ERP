import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { invItems } from '@/server/inventory';
import { prInclude, prView } from '@/server/views';
import { config, PR_SEE_ALL } from '@/lib/domain';
import { pageOf } from '@/lib/paging';
import { PurchaseView } from './view';

const PER_PAGE = 20;

export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requirePage('purchase');
  const where = PR_SEE_ALL.includes(me.role) ? {} : { requesterId: me.id };
  const [total, { items }, sp] = await Promise.all([db.purchaseRequest.count({ where }), invItems(), searchParams]);
  const page = pageOf(sp.page, total, PER_PAGE);
  const prs = await db.purchaseRequest.findMany({ where, include: prInclude, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.size });
  return <PurchaseView prs={prs.map(p => prView(p, me))} page={page} items={items} factor={config.reorderFactor()} />;
}
