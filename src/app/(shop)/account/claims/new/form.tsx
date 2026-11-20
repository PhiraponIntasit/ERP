'use client';
import { useActionState } from 'react';
import { submitClaimForm, type ClaimFormState } from '@/server/actions/claims';
import { Err } from '@/components/dialog';
import css from '../../../storefront.module.css';

type Unit = { serial: string; name: string; orderId: string; untilText: string; ok: boolean; why: string };

export function ClaimForm({ units, initial }: { units: Unit[]; initial: string }) {
  const [st, action, pending] = useActionState<ClaimFormState, FormData>(submitClaimForm, {});
  const chosen = st.values?.serial ?? (units.some(u => u.ok && u.serial === initial) ? initial : units.filter(u => u.ok).length === 1 ? units.find(u => u.ok)!.serial : '');
  return (
    <form action={action} className="card" style={{ padding: 20, gap: 16 }}>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8, padding: 0 }}>เลือกสินค้าที่ต้องการเคลม</legend>
        <ul className={css.units}>
          {units.map(u => (
            <li key={u.serial}>
              <label className={css.unit}>
                <input type="radio" name="serial" value={u.serial} defaultChecked={u.serial === chosen} disabled={!u.ok} required aria-describedby={`u-${u.serial}`} />
                <span className={css.unitText} id={`u-${u.serial}`}>
                  <strong>{u.name}</strong>
                  <span className="tnum">Serial {u.serial}</span>
                  <span className="muted tnum">คำสั่งซื้อ {u.orderId} · ประกันถึง {u.untilText}</span>
                  {!u.ok && <span className={css.stockLow}>{u.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="field">
        <label htmlFor="cl-problem">อาการเสีย</label>
        <textarea id="cl-problem" name="problem" className="input" rows={5} minLength={10} maxLength={1000} required
          defaultValue={st.values?.problem ?? ''} placeholder="เช่น เปิดเครื่องแล้วไม่ขึ้นภาพ พัดลมหมุนแต่ไม่มีสัญญาณออกจอ ลองเปลี่ยนสายแล้ว" />
      </div>
      <Err msg={st.error ?? ''} />
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>หลังส่งเรื่อง ให้ส่งสินค้ามาที่ร้านพร้อมเขียนเลขที่เคลมหน้ากล่อง ร้านจะแจ้งผลทางอีเมล</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={pending || !units.some(u => u.ok)}>ส่งเรื่องเคลม</button>
      </div>
    </form>
  );
}
