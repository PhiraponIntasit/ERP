import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { assetRows } from '@/server/assets';
import { AssetsView } from './view';

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ tag?: string | string[] }> }) {
  await requirePage('assets');
  const [rows, emps] = await Promise.all([assetRows(), db.employee.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, dept: true } })]);
  // /assets?tag=NB-0077 opens that asset — a QR sticker can carry this link so any phone camera lands on it
  const tag = (await searchParams).tag;
  return <AssetsView rows={rows} emps={emps} openTag={typeof tag === 'string' ? tag.trim().toUpperCase() : undefined} />;
}
