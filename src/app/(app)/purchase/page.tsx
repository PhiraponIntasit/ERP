import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { invItems } from '@/server/inventory';
import { prInclude, prView } from '@/server/views';
import { config, PR_SEE_ALL } from '@/lib/domain';
import { PurchaseView } from './view';

export default async function PurchasePage() {
  const me = await requirePage('purchase');
  const [prs, { items }] = await Promise.all([
    db.purchaseRequest.findMany({ where: PR_SEE_ALL.includes(me.role) ? {} : { requesterId: me.id }, include: prInclude, orderBy: { date: 'desc' } }),
    invItems(),
  ]);
  return <PurchaseView prs={prs.map(p => prView(p, me))} items={items} factor={config.reorderFactor()} />;
}
