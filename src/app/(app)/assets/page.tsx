import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { assetRows } from '@/server/assets';
import { AssetsView } from './view';

export default async function AssetsPage() {
  await requirePage('assets');
  const [rows, emps] = await Promise.all([assetRows(), db.employee.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, dept: true } })]);
  return <AssetsView rows={rows} emps={emps} />;
}
