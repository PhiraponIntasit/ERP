'use client';
import Link from 'next/link';
import { useActionState, useTransition, useState } from 'react';
import { login, demoLogin } from '@/server/actions/auth';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: '' });
  return (
    <form action={action} className="card elev-sm login-card">
      <div>
        <div className="card-kicker">Sign in</div>
        <h2 style={{ margin: '6px 0 0', fontWeight: 500 }}>เข้าสู่ระบบ</h2>
      </div>
      <div className="field"><label htmlFor="u">ชื่อผู้ใช้ (Username)</label><input id="u" name="u" className="input" placeholder="เช่น wiphada" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="p">รหัสผ่าน</label><input id="p" name="p" className="input" type="password" placeholder="••••" autoComplete="current-password" required /></div>
      {state.error && <div style={{ fontSize: 13, color: 'var(--color-accent-800)', borderTop: '1px solid var(--color-accent)', paddingTop: 8 }} role="alert">{state.error}</div>}
      <button type="submit" className="btn btn-primary btn-block" style={{ padding: 12, fontSize: 16 }} disabled={pending}>เข้าสู่ระบบ</button>
      <Link href="/forgot-password" style={{ fontSize: 14, alignSelf: 'flex-start' }}>ลืมรหัสผ่าน?</Link>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', textAlign: 'justify' }}>ต้องการบัญชีใหม่ ติดต่อผู้ดูแลระบบ (Admin) — ระบบไม่เปิดให้สมัครเอง</div>
    </form>
  );
}

export function DemoAccounts({ users }: { users: { username: string; name: string; roleLabel: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>บัญชีทดลอง · รหัสผ่าน 1234 · คลิกเพื่อเข้าสู่ระบบ</div>
      {users.map(d => (
        <button key={d.username} type="button" className="demo-row" disabled={pending}
          onClick={() => start(async () => { setErr(''); const r = await demoLogin(d.username); if (r?.error) setErr(r.error); })}>
          <span className="tag tag-outline" style={{ justifyContent: 'center' }}>{d.roleLabel}</span>
          <span style={{ fontSize: 14 }}>{d.name}</span>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{d.username}</span>
        </button>
      ))}
      {err && <div className="err" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}
