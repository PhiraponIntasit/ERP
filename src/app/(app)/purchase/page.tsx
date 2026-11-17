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
  const mine = PR_SEE_ALL.includes(me.role) ? {} : { requesterId: me.id };
  // Approved PRs wait for goods receipt, so they're always listed on top instead of paging away
  const rest = { ...mine, status: { not: 'approved' } };
  const [toReceive, total, { items }, sp] = await Promise.all([
    db.purchaseRequest.findMany({ where: { ...mine, status: 'approved' }, include: prInclude, orderBy: [{ decided: 'asc' }, { id: 'asc' }] }),
    db.purchaseRequest.count({ where: rest }), invItems(), searchParams,
  ]);
  const suppliers = await db.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const page = pageOf(sp.page, total, PER_PAGE);
  const prs = await db.purchaseRequest.findMany({ where: rest, include: prInclude, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.size });
  return <PurchaseView toReceive={toReceive.map(p => prView(p, me))} prs={prs.map(p => prView(p, me))} page={page} items={items} suppliers={suppliers} factor={config.reorderFactor()} />;
}
