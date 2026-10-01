import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { allowedModules, getUser } from '@/server/auth';
import { shellData } from '@/server/queries';
import { config, MOD_LABEL, MOD_PATH, ROLE_LABEL, type Role } from '@/lib/domain';
import { Sidebar, Topbar } from '@/components/shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUser();
  if (!me) redirect('/login');
  const { badges, notifs } = await shellData(me);
  const nav = allowedModules(me).map((m, i) => ({ key: m, num: String(i + 1).padStart(2, '0'), label: MOD_LABEL[m], href: MOD_PATH[m], badge: badges[m] || 0 }));
  const t = (await cookies()).get('erp_theme')?.value;
  return (
    <div className="shell">
      <Sidebar nav={nav} me={{ name: me.name, username: me.username, roleLabel: ROLE_LABEL[me.role as Role] ?? me.role, initial: me.name.charAt(0) }} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar notifs={notifs} theme={t === 'dark' || t === 'light' ? t : config.defaultTheme()} />
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
