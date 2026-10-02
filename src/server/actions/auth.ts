'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '../db';
import { audit, createSession, currentSessionId, destroySession, getUser, homePath, requireAction } from '../auth';
import { act, Fail } from '../act';
import { config } from '@/lib/domain';

// Compared against when the username does not exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = '$2b$10$Yee5ByqkJor3C71/w2n6z.guuXTlLPw97EUeCEWJuH52ntC7180X2';

async function doLogin(rawU: string, p: string): Promise<{ error: string }> {
  const u = rawU.trim().toLowerCase();
  const user = u ? await db.user.findUnique({ where: { username: u } }) : null;
  const ok = await bcrypt.compare(p, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit(db, null, 'auth', 'เข้าสู่ระบบไม่สำเร็จ', rawU.trim() || '(ว่าง)', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  if (!user.active) {
    await audit(db, null, 'auth', 'เข้าสู่ระบบไม่สำเร็จ', user.username, 'บัญชีถูกระงับ');
    return { error: 'บัญชีนี้ถูกระงับการใช้งาน ติดต่อผู้ดูแลระบบ' };
  }
  await createSession(user.id);
  await audit(db, user, 'auth', 'เข้าสู่ระบบ', user.username);
  redirect(homePath(user));
}

export async function login(_prev: { error: string }, fd: FormData) {
  return doLogin(String(fd.get('u') ?? ''), String(fd.get('p') ?? ''));
}

/** One-click demo sign-in (only when SHOW_DEMO_ACCOUNTS=true). Uses the seeded demo password. */
export async function demoLogin(username: string) {
  if (!config.showDemo()) return { error: 'ปิดการใช้งานบัญชีทดลอง' };
  return doLogin(username, '1234');
}

export async function logout() {
  const me = await getUser();
  if (me) await audit(db, me, 'auth', 'ออกจากระบบ', me.username);
  await destroySession();
  redirect('/login');
}

/** Any signed-in user may change their own password. Other devices are signed out; this one stays signed in. */
export async function changeOwnPassword(current: string, next: string, confirm: string) {
  return act(async () => {
    const me = await requireAction();
    if (!current || !next) throw new Fail('กรุณากรอกรหัสผ่านให้ครบ');
    if (!(await bcrypt.compare(current, me.passwordHash))) {
      await audit(db, me, 'user', 'เปลี่ยนรหัสผ่านไม่สำเร็จ', me.username, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
      throw new Fail('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    if (next.length < 4) throw new Fail('รหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร');
    if (next !== confirm) throw new Fail('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (next === current) throw new Fail('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    const passwordHash = await bcrypt.hash(next, 10);
    const keep = await currentSessionId();
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
      const out = await tx.session.deleteMany({ where: { userId: me.id, ...(keep ? { id: { not: keep } } : {}) } });
      await audit(tx, me, 'user', 'เปลี่ยนรหัสผ่าน', me.username, out.count ? `ออกจากระบบอุปกรณ์อื่น ${out.count} เครื่อง` : '');
    });
    return 'เปลี่ยนรหัสผ่านแล้ว';
  });
}
