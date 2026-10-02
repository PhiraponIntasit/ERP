import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { prInclude, prView } from '@/server/views';
import { bahtS, config } from '@/lib/domain';
import { pageOf } from '@/lib/paging';
import { ApprovalsView } from './view';

const PENDING = ['pending', 'pending_exec'];
const DECIDED_PER_PAGE = 20;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requirePage('approvals');
  const decidedWhere = { status: { notIn: PENDING } };
  const [pending, stock, total, sp] = await Promise.all([
    db.purchaseRequest.findMany({ where: { status: { in: PENDING } }, include: prInclude, orderBy: { date: 'desc' } }),
    db.inventoryItem.findMany({ select: { sku: true, qty: true, min: true } }),
    db.purchaseRequest.count({ where: decidedWhere }),
    searchParams,
  ]);
  const page = pageOf(sp.page, total, DECIDED_PER_PAGE);
  const decided = await db.purchaseRequest.findMany({
    where: decidedWhere, include: prInclude, skip: page.skip, take: page.size,
    orderBy: [{ decided: { sort: 'desc', nulls: 'last' } }, { date: 'desc' }, { id: 'desc' }],
  });
  const st = new Map(stock.map(s => [s.sku, s]));
  return <ApprovalsView pending={pending.map(p => prView(p, me, st))} decided={decided.map(p => prView(p, me))} decidedPage={page} limitText={bahtS(config.approvalLimit())} />;
}
