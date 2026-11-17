import Link from 'next/link';
import type { Metadata } from 'next';
import { findValidReset } from '@/server/password-reset';
import { ResetForm } from './form';

// Keep the token in the URL out of Referer headers sent to fonts/CDNs.
export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่ · IT Products Store', referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? '';
  const r = await findValidReset(token);
  return (
    <div className="login-wrap">
      <div style={{ width: 'min(440px, 100%)' }}>
        {r ? <ResetForm token={token} username={r.user.username} /> : (
          <div className="card elev-sm login-card">
            <div>
              <div className="card-kicker">Reset password</div>
              <h2 style={{ margin: '6px 0 0', fontWeight: 700 }}>ลิงก์ใช้ไม่ได้</h2>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ลิงก์ตั้งรหัสผ่านใช้ได้ครั้งเดียวภายใน 30 นาที</p>
            <Link href="/forgot-password" className="btn btn-primary btn-block" style={{ padding: 12 }}>ขอลิงก์ใหม่</Link>
            <Link href="/login" style={{ fontSize: 14 }}>← กลับไปหน้าเข้าสู่ระบบ</Link>
          </div>
        )}
      </div>
    </div>
  );
}
