// Prepares an empty production database: document counters + the first Admin account.
// Safe to re-run — it never touches a database that already has users.
//   ADMIN_USERNAME=admin ADMIN_NAME="ชื่อ นามสกุล" ADMIN_PASSWORD='…' npm run db:bootstrap
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE_PERMS } from '../src/lib/domain';

const db = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || 'ผู้ดูแลระบบ').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  // First numbers issued: TCK-1001, PR-<year>-0001, EMP-0001
  await db.counter.createMany({ data: [{ key: 'tck', value: 1001 }, { key: 'pr', value: 1 }, { key: 'emp', value: 1 }], skipDuplicates: true });

  if (await db.user.count()) { console.log('Users already exist — no account created.'); return; }
  const u = await db.user.create({ data: { username, name, role: 'admin', perms: [...ROLE_PERMS.admin], passwordHash: await bcrypt.hash(password, 10) } });
  await db.auditLog.create({ data: { userId: u.id, by: '(ระบบ)', role: '—', cat: 'user', action: 'สร้างบัญชีผู้ดูแลระบบเริ่มต้น', target: username } });
  console.log(`Created Admin "${username}". Sign in and create the other accounts from บัญชีผู้ใช้ & สิทธิ์.`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); }).finally(() => db.$disconnect());
