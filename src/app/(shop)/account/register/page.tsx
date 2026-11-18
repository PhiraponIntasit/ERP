import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCustomer } from '@/server/customer-session';
import { RegisterForm } from '../forms';

export const metadata: Metadata = { title: 'สมัครสมาชิก · COREPICK' };

export default async function CustomerRegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCustomer()) redirect('/account');
  const raw = (await searchParams).next;
  return <RegisterForm next={typeof raw === 'string' ? raw : ''} />;
}
