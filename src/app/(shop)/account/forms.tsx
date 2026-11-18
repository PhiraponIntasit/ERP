'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { loginCustomer, registerCustomer } from '@/server/actions/customer-auth';
import { MIN_PASSWORD } from '@/lib/password';
import css from '../storefront.module.css';

const q = (next: string) => (next ? `?next=${encodeURIComponent(next)}` : '');

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginCustomer, { error: '' });
  return (
    <form action={action} className={`card ${css.authCard}`} noValidate>
      <h1>เข้าสู่ระบบ</h1>
      <input type="hidden" name="next" value={next} />
      <div className="field"><label htmlFor="cl-email">อีเมล</label>
        <input id="cl-email" name="email" type="email" className="input" autoComplete="email" inputMode="email" defaultValue={state.values?.email} required /></div>
      <div className="field"><label htmlFor="cl-password">รหัสผ่าน</label>
        <input id="cl-password" name="password" type="password" className="input" autoComplete="current-password" required /></div>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      <p className={css.authAlt}>ยังไม่มีบัญชี? <Link href={`/account/register${q(next)}`}>สมัครสมาชิก</Link></p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(registerCustomer, { error: '' });
  const v = state.values ?? {};
  return (
    <form action={action} className={`card ${css.authCard}`} noValidate>
      <h1>สมัครสมาชิก</h1>
      <input type="hidden" name="next" value={next} />
      <div className="field"><label htmlFor="cr-name">ชื่อ-นามสกุล</label>
        <input id="cr-name" name="name" className="input" autoComplete="name" defaultValue={v.name} required /></div>
      <div className="field"><label htmlFor="cr-email">อีเมล</label>
        <input id="cr-email" name="email" type="email" className="input" autoComplete="email" inputMode="email" defaultValue={v.email} required /></div>
      <div className="field"><label htmlFor="cr-phone">เบอร์โทร (ไม่บังคับ)</label>
        <input id="cr-phone" name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" defaultValue={v.phone} placeholder="081-234-5678" /></div>
      <div className="field"><label htmlFor="cr-password">รหัสผ่าน (อย่างน้อย {MIN_PASSWORD} ตัว)</label>
        <input id="cr-password" name="password" type="password" className="input" autoComplete="new-password" required /></div>
      <div className="field"><label htmlFor="cr-confirm">ยืนยันรหัสผ่าน</label>
        <input id="cr-confirm" name="confirm" type="password" className="input" autoComplete="new-password" required /></div>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}</button>
      <p className={css.authAlt}>มีบัญชีแล้ว? <Link href={`/account/login${q(next)}`}>เข้าสู่ระบบ</Link></p>
    </form>
  );
}
