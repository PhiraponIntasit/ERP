'use server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { db } from '../db';
import { audit } from '../auth';
import { appUrl, sendMail } from '../mail';
import { passwordProblem } from '@/lib/password';
import { findValidReset, sha256 } from '../password-reset';

const TTL_MIN = 30;           // link lifetime
const MAX_PER_HOUR = 3;       // emails per account per hour (stops inbox flooding)

/** Same reply whether or not the account exists, so the form can't be used to discover usernames or emails. */
const SENT = 'ถ้าข้อมูลตรงกับบัญชีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้แล้ว ลิงก์ใช้ได้ภายใน 30 นาที';

const mask = (email: string) => email.replace(/^(.{2}).*(@.*)$/, (_, a, b) => a + '•••' + b);

export async function requestPasswordReset(_prev: { msg: string; error: string }, fd: FormData) {
  const ident = String(fd.get('ident') ?? '').trim().toLowerCase().slice(0, 200);
  if (!ident) return { msg: '', error: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล' };

  const user = ident.includes('@')
    ? await db.user.findFirst({ where: { employee: { email: { equals: ident, mode: 'insensitive' } } }, include: { employee: true } })
    : await db.user.findUnique({ where: { username: ident }, include: { employee: true } });
  const email = user?.employee?.email?.trim();

  if (!user || !user.active || !email) {
    await audit(db, null, 'auth', 'ขอรีเซ็ตรหัสผ่านไม่สำเร็จ', ident,
      !user ? 'ไม่พบบัญชี' : !user.active ? 'บัญชีถูกระงับ' : 'บัญชีไม่มีอีเมล');
    return { msg: SENT, error: '' };
  }
  const recent = await db.passwordReset.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 36e5) } } });
  if (recent >= MAX_PER_HOUR) {
    await audit(db, user, 'auth', 'ขอรีเซ็ตรหัสผ่านไม่สำเร็จ', user.username, `ขอเกิน ${MAX_PER_HOUR} ครั้งใน 1 ชั่วโมง`);
    return { msg: SENT, error: '' };
  }
  const base = appUrl();
  if (!base) { console.error('APP_URL is not configured — cannot build password reset links'); return { msg: '', error: 'ระบบยังไม่ได้ตั้งค่าการส่งอีเมล กรุณาติดต่อผู้ดูแลระบบ' }; }

  const token = randomBytes(32).toString('base64url');
  await db.$transaction([
    // only the newest link is valid
    db.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordReset.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + TTL_MIN * 6e4) } }),
  ]);
  const link = `${base}/reset-password?token=${token}`;
  const to = email, who = { id: user.id, name: user.name, role: user.role, username: user.username };
  // Sent after the response, so a real account takes as long to answer as an unknown one.
  after(async () => {
    try {
      await sendMail(to, 'ตั้งรหัสผ่านใหม่ · IT Products Store',
        `สวัสดีคุณ ${who.name}\n\nมีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${who.username}\nเปิดลิงก์นี้ภายใน ${TTL_MIN} นาทีเพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ครั้งเดียว):\n\n${link}\n\nถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ`,
        `<p>สวัสดีคุณ ${escapeHtml(who.name)}</p><p>มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี <b>${escapeHtml(who.username)}</b></p>
         <p><a href="${link}">ตั้งรหัสผ่านใหม่</a> — ลิงก์ใช้ได้ภายใน ${TTL_MIN} นาที และใช้ได้ครั้งเดียว</p>
         <p style="color:#666">ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>`);
      await audit(db, who, 'auth', 'ขอรีเซ็ตรหัสผ่าน', who.username, 'ส่งลิงก์ไปที่ ' + mask(to));
    } catch (e) {
      console.error('password reset email failed', e);
      await audit(db, who, 'auth', 'ขอรีเซ็ตรหัสผ่านไม่สำเร็จ', who.username, 'ส่งอีเมลไม่สำเร็จ');
    }
  });
  return { msg: SENT, error: '' };
}

export async function resetPassword(_prev: { done: boolean; error: string }, fd: FormData) {
  const token = String(fd.get('token') ?? ''), next = String(fd.get('next') ?? ''), confirm = String(fd.get('confirm') ?? '');
  const r = await findValidReset(token);
  if (!r) return { done: false, error: 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่' };
  if (next !== confirm) return { done: false, error: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' };
  const weak = passwordProblem(next);
  if (weak) return { done: false, error: weak };
  const passwordHash = await bcrypt.hash(next, 10);
  const ok = await db.$transaction(async tx => {
    // conditional claim: a link can't be used twice even with concurrent submits
    const c = await tx.passwordReset.updateMany({ where: { id: r.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (c.count !== 1) return false;
    await tx.user.update({ where: { id: r.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: r.userId } });  // sign out everywhere
    await audit(tx, r.user, 'auth', 'ตั้งรหัสผ่านใหม่ผ่านอีเมล', r.user.username, 'ออกจากระบบทุกอุปกรณ์');
    return true;
  });
  return ok ? { done: true, error: '' } : { done: false, error: 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่' };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
