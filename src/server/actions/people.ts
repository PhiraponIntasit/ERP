'use server';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { audit, requireAction } from '../auth';
import { act, Fail, str } from '../act';
import { activeWorkOf, canTakeWork } from '../assignable';
import { passwordProblem } from '@/lib/password';
import { ALL, isModule, isRole, MOD_LABEL, ROLE_LABEL, ROLE_PERMS } from '@/lib/domain';

const CONTACT_F = { email: 'อีเมล', phone: 'โทร', dept: 'แผนก' } as const;
type Contact = Record<keyof typeof CONTACT_F, string>;

/** Work email / phone / department, trimmed and checked. */
function readContact(f: Partial<Record<string, string>>): Contact {
  const c = { email: str(f.email).toLowerCase().slice(0, 120), phone: str(f.phone).slice(0, 30), dept: str(f.dept).slice(0, 60) };
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new Fail('อีเมลไม่ถูกต้อง');
  return c;
}

// ── user accounts & permissions ──

export async function createUser(f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('users');
    const name = str(f.name), username = str(f.username).toLowerCase(), password = String(f.password ?? '');
    const role = isRole(str(f.role)) ? str(f.role) as keyof typeof ROLE_PERMS : 'employee';
    const contact = readContact(f);
    if (!name || !username) throw new Fail('กรอกชื่อและ Username');
    if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Fail('Username ใช้ได้เฉพาะ a–z, 0–9, . _ - (2–32 ตัว)');
    if (await db.user.findUnique({ where: { username } })) throw new Fail('Username นี้ถูกใช้แล้ว');
    const weak = passwordProblem(password);
    if (weak) throw new Fail(weak);
    const passwordHash = await bcrypt.hash(password, 10);
    await db.$transaction(async tx => {
      await tx.user.create({ data: { username, passwordHash, name, role, ...contact, perms: [...ROLE_PERMS[role]] } });
      await audit(tx, me, 'user', 'สร้างบัญชีผู้ใช้', username, 'บทบาท ' + ROLE_LABEL[role]);
    });
    return `สร้างบัญชี ${username} แล้ว`;
  });
}

export async function savePerms(userId: string, roleIn: string, permsIn: string[], password: string, contactIn: Partial<Contact> = {}) {
  return act(async () => {
    const me = await requireAction('users');
    if (!isRole(roleIn)) throw new Fail('บทบาทไม่ถูกต้อง');
    const np = ALL.filter(m => (permsIn ?? []).filter(isModule).includes(m));
    if (userId === me.id && !np.includes('users')) throw new Fail('ไม่สามารถถอดสิทธิ์จัดการผู้ใช้ของตัวเองได้');
    if (!np.length) throw new Fail('ต้องมีสิทธิ์อย่างน้อย 1 เมนู');
    const weak = password ? passwordProblem(password) : null;
    if (weak) throw new Fail(weak);
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u) throw new Fail('ไม่พบผู้ใช้');
    const contact = readContact({ email: u.email, phone: u.phone, dept: u.dept, ...contactIn });
    const ch = [...np.filter(m => !u.perms.includes(m)).map(m => '+' + MOD_LABEL[m]), ...u.perms.filter(isModule).filter(m => !np.includes(m)).map(m => '−' + MOD_LABEL[m])];
    const parts: string[] = [];
    if (u.role !== roleIn) parts.push('บทบาท ' + (ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role) + ' → ' + ROLE_LABEL[roleIn]);
    if (ch.length) parts.push(ch.join(', '));
    for (const k of Object.keys(CONTACT_F) as (keyof Contact)[]) if (u[k] !== contact[k]) parts.push(`${CONTACT_F[k]} ${u[k] || '—'} → ${contact[k] || '—'}`);
    if (password) parts.push('รีเซ็ตรหัสผ่าน');
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    const losesWork = canTakeWork(u) && !canTakeWork({ ...u, role: roleIn, perms: np });
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { role: roleIn, perms: np, ...contact, ...(passwordHash ? { passwordHash } : {}) } });
      // A reset password signs the person out everywhere (except the admin doing it on themselves).
      if (passwordHash && userId !== me.id) await tx.session.deleteMany({ where: { userId } });
      await audit(tx, me, 'user', 'แก้ไขสิทธิ์ผู้ใช้', u.username, parts.join(' · ') || 'ไม่มีการเปลี่ยนแปลง');
    });
    const left = losesWork ? await activeWorkOf(userId) : 0;
    return left ? `บันทึกสิทธิ์แล้ว — ${u.name} รับงานซ่อมไม่ได้แล้ว แต่ยังมีงานค้าง ${left} งาน ให้ IT Manager มอบหมายใหม่` : 'บันทึกสิทธิ์แล้ว';
  });
}

export async function toggleUserActive(userId: string) {
  return act(async () => {
    const me = await requireAction('users');
    if (userId === me.id) throw new Fail('ไม่สามารถระงับบัญชีของตัวเองได้');
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u) throw new Fail('ไม่พบผู้ใช้');
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { active: !u.active } });
      if (u.active) await tx.session.deleteMany({ where: { userId } });
      await audit(tx, me, 'user', u.active ? 'ระงับบัญชี' : 'เปิดใช้บัญชี', u.username);
    });
    const left = u.active ? await activeWorkOf(userId) : 0;
    if (left) return `ระงับบัญชี ${u.username} แล้ว — ยังมีงานซ่อมค้าง ${left} งาน ให้ IT Manager มอบหมายใหม่`;
    return u.active ? `ระงับบัญชี ${u.username}` : `เปิดใช้บัญชี ${u.username}`;
  });
}
