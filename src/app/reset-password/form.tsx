'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { resetPassword } from '@/server/actions/password-reset';
import { MIN_PASSWORD } from '@/lib/password';

export function ResetForm({ token, username }: { token: string; username: string }) {
  const [state, action, pending] = useActionState(resetPassword, { done: false, error: '' });
  return (
    <form action={action} className="card elev-sm login-card">
      <div>
        <div className="card-kicker">Reset password</div>
        <h2 style={{ margin: '6px 0 0', fontWeight: 500 }}>ตั้งรหัสผ่านใหม่</h2>
      </div>
      {state.done ? (<>
        <div role="status" style={{ fontSize: 14, borderTop: '1px solid var(--color-accent)', paddingTop: 10 }}>ตั้งรหัสผ่านใหม่แล้ว ระบบออกจากระบบในทุกอุปกรณ์ให้แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</div>
        <Link href="/login" className="btn btn-primary btn-block" style={{ padding: 12, fontSize: 16 }}>ไปหน้าเข้าสู่ระบบ</Link>
      </>) : (<>
        <input type="hidden" name="token" value={token} />
        {/* lets password managers attach the new password to the right account */}
        <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
        <div style={{ fontSize: 14 }}>บัญชี: <strong style={{ fontWeight: 500 }}>{username}</strong></div>
        <div className="field"><label htmlFor="rp-new">รหัสผ่านใหม่ (อย่างน้อย {MIN_PASSWORD} ตัว)</label><input id="rp-new" name="next" className="input" type="password" autoComplete="new-password" required autoFocus /></div>
        <div className="field"><label htmlFor="rp-cf">ยืนยันรหัสผ่านใหม่</label><input id="rp-cf" name="confirm" className="input" type="password" autoComplete="new-password" required /></div>
        {state.error && <div className="err" role="alert">{state.error}</div>}
        <button type="submit" className="btn btn-primary btn-block" style={{ padding: 12, fontSize: 16 }} disabled={pending}>บันทึกรหัสผ่านใหม่</button>
      </>)}
    </form>
  );
}
