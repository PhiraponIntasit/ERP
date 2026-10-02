import { db } from '@/server/db';
import { can, requirePage } from '@/server/auth';
import { invItems } from '@/server/inventory';
import { config, fmtDT } from '@/lib/domain';
import { pageOf } from '@/lib/paging';
import { InventoryView } from './view';

const MOVES_PER_PAGE = 20;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requirePage('inventory');
  const [{ items }, total, sp] = await Promise.all([invItems(), db.stockMove.count(), searchParams]);
  const page = pageOf(sp.page, total, MOVES_PER_PAGE);
  const moves = await db.stockMove.findMany({ orderBy: [{ t: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.size, include: { item: { select: { name: true } } } });
  return <InventoryView items={items} manage={can(me, 'purchase')} factor={config.reorderFactor()} movesPage={page}
    moves={moves.map(m => ({ id: m.id, tText: fmtDT(m.t), name: m.item.name, type: m.type, qty: m.qty, ref: m.ref, by: m.by }))} />;
}
