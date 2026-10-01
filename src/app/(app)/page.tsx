import { redirect } from 'next/navigation';
import { getUser, homePath } from '@/server/auth';

export default async function Home() {
  const me = await getUser();
  redirect(me ? homePath(me) : '/login');
}
