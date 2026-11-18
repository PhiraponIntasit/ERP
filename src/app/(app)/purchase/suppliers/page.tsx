import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { SuppliersView } from './view';

export default async function SuppliersPage() {
  await requirePage('purchase');
  const rows = await db.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { purchases: true } } } });
  return <SuppliersView rows={rows.map(s => ({ id: s.id, name: s.name, taxId: s.taxId, phone: s.phone, email: s.email, active: s.active, prs: s._count.purchases }))} />;
}
