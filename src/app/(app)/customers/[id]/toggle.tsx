'use client';
import { useState } from 'react';
import { setCustomerActive } from '@/server/actions/customers';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';

export function ActiveToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [ask, setAsk] = useState(false);
  const { run, pending, error } = useAction();
  const toast = useAction({ errorAs: 'toast' });
  if (!active) return <button className="btn btn-primary" disabled={toast.pending} onClick={() => toast.run(() => setCustomerActive(id, true))}>เปิดใช้บัญชี</button>;
  return (
    <>
      <button className="btn btn-secondary" onClick={() => setAsk(true)}>ระงับบัญชี</button>
      {ask && (
        <Dialog title="ระงับบัญชีลูกค้า" className="w560" onClose={() => setAsk(false)}>
          <p style={{ margin: 0 }}>ระงับบัญชีของ <b>{name}</b>? ลูกค้าจะออกจากระบบทุกอุปกรณ์และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้ใหม่ คำสั่งซื้อที่มีอยู่ไม่ถูกยกเลิก</p>
          <Err msg={error} />
          <div className="dialog-actions">
            <button className="btn btn-secondary" onClick={() => setAsk(false)}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => setCustomerActive(id, false), () => setAsk(false))}>ระงับบัญชี</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
