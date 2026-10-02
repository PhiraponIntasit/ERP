'use client';
import { useState } from 'react';
import { changeOwnPassword } from '@/server/actions/auth';
import { useAction } from './use-action';
import { Dialog, Err } from './dialog';
import { KeyIcon } from './icons';
import { MIN_PASSWORD } from '@/lib/password';

/** Sidebar button + dialog: signed-in users change their own password. */
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setOpen(true)}>
        <KeyIcon /> เปลี่ยนรหัสผ่าน
      </button>
      {open && <ChangePasswordDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const { run, pending, error, setError } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF(x => ({ ...x, [k]: e.target.value })); setError(''); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next !== f.confirm) return setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    run(() => changeOwnPassword(f.current, f.next, f.confirm), onClose);
  };
  return (
    <Dialog title="เปลี่ยนรหัสผ่าน" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="dialog-body">เมื่อเปลี่ยนแล้ว ระบบจะออกจากระบบในอุปกรณ์อื่นทั้งหมด ยกเว้นเครื่องนี้</div>
        <div className="field"><label htmlFor="cp-cur">รหัสผ่านปัจจุบัน</label><input id="cp-cur" className="input" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} autoFocus /></div>
        <div className="field"><label htmlFor="cp-new">รหัสผ่านใหม่ (อย่างน้อย {MIN_PASSWORD} ตัว)</label><input id="cp-new" className="input" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} /></div>
        <div className="field"><label htmlFor="cp-cf">ยืนยันรหัสผ่านใหม่</label><input id="cp-cf" className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></div>
        <Err msg={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>บันทึกรหัสผ่านใหม่</button>
        </div>
      </form>
    </Dialog>
  );
}
