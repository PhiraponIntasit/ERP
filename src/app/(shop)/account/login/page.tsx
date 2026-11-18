import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { LoginForm } from '../forms';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ · COREPICK' };

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === 'string' ? raw : '';
  const safe = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/account/');
  if (await getCustomer()) redirect(safe ? next : '/account');
  return <LoginForm next={next} />;
}
