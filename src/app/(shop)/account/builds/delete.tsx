'use client';
import { deleteBuild } from '@/server/actions/pc-builder';
import { useAction } from '@/components/use-action';

export function DeleteBuild({ id, name }: { id: string; name: string }) {
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <button className="btn btn-secondary" disabled={pending} onClick={() => { if (confirm(`ลบ “${name}”?`)) run(() => deleteBuild(id)); }}>ลบ</button>
  );
}
