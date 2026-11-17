'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '@/server/actions/password-reset';

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, { msg: '', error: '' });
  return (
    <form action={action} className="card elev-sm login-card">
      <div>
        <div className="card-kicker">Forgot password</div>
        <h2 style={{ margin: '6px 0 0', fontWeight: 700 }}>ลืมรหัสผ่าน</h2>
      </div>
      {state.msg ? (
        <div role="status" style={{ fontSize: 14, textAlign: 'left', borderTop: '1px solid var(--color-accent)', paddingTop: 10 }}>{state.msg}</div>
      ) : (<>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-700)', textAlign: 'left' }}>กรอกชื่อผู้ใช้หรืออีเมลของคุณ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้กับข้อมูลพนักงาน</p>
        <div className="field"><label htmlFor="ident">ชื่อผู้ใช้ หรือ อีเมล</label><input id="ident" name="ident" className="input" autoComplete="username" required maxLength={200} autoFocus /></div>
        {state.error && <div className="err" role="alert">{state.error}</div>}
        <button type="submit" className="btn btn-primary btn-block" style={{ padding: 12, fontSize: 16 }} disabled={pending}>ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
      </>)}
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', textAlign: 'left' }}>ไม่ได้รับอีเมล หรือบัญชีไม่มีอีเมล ติดต่อผู้ดูแลระบบ (Admin) ให้ตั้งรหัสผ่านใหม่ให้</div>
      <Link href="/login" style={{ fontSize: 14 }}>← กลับไปหน้าเข้าสู่ระบบ</Link>
    </form>
  );
}
