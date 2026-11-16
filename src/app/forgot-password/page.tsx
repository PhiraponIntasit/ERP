import { redirect } from 'next/navigation';
import { getUser, homePath } from '@/server/auth';
import { ForgotForm } from './form';

export const metadata = { title: 'ลืมรหัสผ่าน · IT Products Store' };

export default async function ForgotPasswordPage() {
  const me = await getUser();
  if (me) redirect(homePath(me));
  return (
    <div className="login-wrap">
      <div style={{ width: 'min(440px, 100%)' }}><ForgotForm /></div>
    </div>
  );
}
