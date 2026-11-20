'use client';
import { cancelMyClaim } from '@/server/actions/claims';
import { useAction } from '@/components/use-action';

export function CancelClaim({ id }: { id: string }) {
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <button className="btn btn-secondary" disabled={pending}
      onClick={() => { if (confirm(`ยกเลิกเคลม ${id}?`)) run(() => cancelMyClaim(id)); }}>
      ยกเลิกเคลม
    </button>
  );
}
