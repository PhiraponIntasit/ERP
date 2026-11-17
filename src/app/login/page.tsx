import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { getUser, nextPath } from '@/server/auth';
import { config, ROLE_LABEL, type Role } from '@/lib/domain';
import { ThemeToggle } from '@/components/theme-toggle';
import { LoginForm, DemoAccounts } from './login-form';
import { Logo } from '@/components/logo';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === 'string' ? raw : '';
  const me = await getUser();
  if (me) redirect(nextPath(me, next));
  const showDemo = config.showDemo();
  const demo = showDemo ? await db.user.findMany({ where: { active: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { username: true, name: true, role: true } }) : [];
  const t = (await cookies()).get('erp_theme')?.value;
  return (
    <>
      <div className="theme-fab"><ThemeToggle initial={t === 'dark' || t === 'light' ? t : config.defaultTheme()} /></div>
      <div className="login-wrap">
        <div className="login-grid">
          <div className="login-intro">
            <Logo height={56} />
            <div className="kicker">IT Products Store Management System · ระบบหลังร้าน</div>
            <h1 style={{ fontSize: 40, fontWeight: 700, margin: 0, lineHeight: 1.25, letterSpacing: '-.02em' }}>คลังสินค้า การจัดซื้อ และงานซ่อม ในระบบเดียว</h1>
            <p style={{ textAlign: 'left', maxWidth: '46ch', color: 'var(--color-neutral-700)', margin: 0 }}>เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลระบบสร้างให้ เมนูและสิทธิ์การใช้งานจะแสดงตามบทบาทและสิทธิ์รายบุคคลของคุณ</p>
            {showDemo && <DemoAccounts next={next} users={demo.map(u => ({ username: u.username, name: u.name, roleLabel: ROLE_LABEL[u.role as Role] ?? u.role }))} />}
            {showDemo && <a href="/demo-shop" style={{ fontSize: 14 }}>เดโมหน้าร้าน — สั่งซื้อและชำระเงินในฐานะลูกค้าตัวอย่าง →</a>}
          </div>
          <LoginForm next={next} />
        </div>
      </div>
    </>
  );
}
