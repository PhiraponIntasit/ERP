import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { EmployeesView } from './view';

export default async function EmployeesPage() {
  await requirePage('employees');
  const [emps, free] = await Promise.all([
    db.employee.findMany({ orderBy: { id: 'asc' }, include: { assets: { orderBy: { tag: 'asc' }, select: { tag: true, type: true, model: true } } } }),
    db.asset.findMany({ where: { holderId: null }, orderBy: { tag: 'asc' }, select: { tag: true, type: true, model: true } }),
  ]);
  return <EmployeesView emps={emps} free={free} />;
}
