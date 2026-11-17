import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { config } from '@/lib/domain';
import { ToastProvider } from '@/components/toast';
import './classical.css';
import './globals.css';

export const metadata: Metadata = { title: 'COREPICK · IT Products Store Management System', description: 'Inventory · Procurement · Helpdesk' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = (await cookies()).get('erp_theme')?.value;
  const theme = t === 'dark' || t === 'light' ? t : config.defaultTheme();
  return (
    <html lang="th" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ToastProvider>
          <div className="root">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
