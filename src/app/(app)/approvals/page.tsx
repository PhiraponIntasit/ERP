import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { prInclude, prView } from '@/server/views';
import { bahtS, config } from '@/lib/domain';
import { ApprovalsView } from './view';

export default async function ApprovalsPage() {
  const me = await requirePage('approvals');
  const [prs, stock] = await Promise.all([
    db.purchaseRequest.findMany({ include: prInclude, orderBy: { date: 'desc' } }),
    db.inventoryItem.findMany({ select: { sku: true, qty: true, min: true } }),
  ]);
  const st = new Map(stock.map(s => [s.sku, s]));
  const all = prs.map(p => prView(p, me, st));
  return <ApprovalsView pending={all.filter(p => p.isPending)} decided={all.filter(p => !p.isPending)} limitText={bahtS(config.approvalLimit())} />;
}
