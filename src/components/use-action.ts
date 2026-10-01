'use client';
import { useState, useTransition } from 'react';
import type { Result } from '@/lib/result';
import { useToast } from './toast';

/**
 * Runs a server action. Success → toast `msg` (if any) and call onOk.
 * Failure → either toast the error (inline buttons) or expose it as `error` (dialog forms).
 */
export function useAction(opts: { errorAs?: 'toast' | 'inline' } = {}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const run = (fn: () => Promise<Result>, onOk?: () => void) => {
    setError('');
    start(async () => {
      let r: Result;
      try { r = await fn(); } catch { r = { ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }; }
      if (r.ok) { if (r.msg) toast(r.msg); onOk?.(); }
      else if (opts.errorAs === 'toast') toast(r.error);
      else setError(r.error);
    });
  };
  return { run, pending, error, setError };
}
