import { db } from '@/server/db';
import { can, requirePage } from '@/server/auth';
import { invItems } from '@/server/inventory';
import { config, fmtDT } from '@/lib/domain';
import { InventoryView } from './view';

export default async function InventoryPage() {
  const me = await requirePage('inventory');
  const [{ items }, moves] = await Promise.all([
    invItems(),
    db.stockMove.findMany({ orderBy: { t: 'desc' }, take: 12, include: { item: { select: { name: true } } } }),
  ]);
  return <InventoryView items={items} manage={can(me, 'purchase')} factor={config.reorderFactor()}
    moves={moves.map(m => ({ id: m.id, tText: fmtDT(m.t), name: m.item.name, type: m.type, qty: m.qty, ref: m.ref, by: m.by }))} />;
}
