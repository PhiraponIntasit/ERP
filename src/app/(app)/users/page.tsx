import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { ROLE_LABEL, ROLE_PERMS, type Role } from '@/lib/domain';
import { UsersView } from './view';

export default async function UsersPage() {
  const me = await requirePage('users');
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
  return <UsersView meId={me.id} users={users.map(u => {
    const def = ROLE_PERMS[u.role as Role] ?? [];
    return { id: u.id, name: u.name, username: u.username, role: u.role, roleLabel: ROLE_LABEL[u.role as Role] ?? u.role, perms: u.perms, active: u.active,
      custom: u.perms.length !== def.length || u.perms.some(p => !(def as string[]).includes(p)),
      email: u.email, phone: u.phone, dept: u.dept };
  })} />;
}
