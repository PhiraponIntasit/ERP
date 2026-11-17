'use client';
import { useState } from 'react';
import { createUser, savePerms, toggleUserActive } from '@/server/actions/people';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { MIN_PASSWORD } from '@/lib/password';
import { ALL, MOD_LABEL, ROLE_PERMS, ROLES, type Module, type Role } from '@/lib/domain';
import css from '@/components/people-tables.module.css';

type U = { id: string; name: string; username: string; role: string; roleLabel: string; perms: string[]; active: boolean; custom: boolean; email: string; phone: string; dept: string };

export function UsersView({ users, meId }: { users: U[]; meId: string }) {
  const [dlg, setDlg] = useState<null | { type: 'new' } | { type: 'perms'; u: U }>(null);
  const { run, pending } = useAction({ errorAs: 'toast' });
  return (
    <div className="anim-page stack-4">
      <div className={`toolbar ${css.toolbar}`}>
        <p className="lead" style={{ flex: 1, minWidth: 0 }}>บัญชีใหม่จะได้รับสิทธิ์เริ่มต้นตามบทบาท จากนั้นปรับสิทธิ์รายบุคคลได้ที่ “กำหนดสิทธิ์”</p>
        <button className="btn btn-primary" onClick={() => setDlg({ type: 'new' })}>+ สร้างบัญชีผู้ใช้</button>
      </div>
      <div className="scroll-x">
        <table className={`table ${css.cards}`}>
          <thead><tr><th>ผู้ใช้</th><th>Username</th><th>บทบาท</th><th>สิทธิ์ที่เข้าถึง</th><th>สถานะ</th><th className="r">จัดการ</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                <td className={css.main}>{u.name}<div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{[u.dept, u.email].filter(Boolean).join(' · ') || 'ยังไม่มีข้อมูลติดต่อ'}</div></td>
                <td data-label="Username" style={{ fontSize: 13 }}>{u.username}</td>
                <td data-label="บทบาท"><span><span className="tag tag-outline">{u.roleLabel}</span>{u.custom && <span style={{ fontSize: 11, color: 'var(--color-accent-700)', marginLeft: 6 }}>ปรับรายบุคคล</span>}</span></td>
                <td data-label="สิทธิ์" style={{ fontSize: 12, maxWidth: 320, color: 'var(--color-neutral-700)' }}>{u.perms.map(p => MOD_LABEL[p as Module] ?? p).join(', ')}</td>
                <td className={css.side}><span className={`tag ${u.active ? 'tag-accent' : 'tag-neutral'}`}>{u.active ? 'ใช้งาน' : 'ระงับ'}</span></td>
                <td className={`r ${css.actions}`}><div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setDlg({ type: 'perms', u })}>กำหนดสิทธิ์</button>
                  {u.id !== meId && <button className="btn btn-ghost" style={{ color: 'var(--color-neutral-700)' }} disabled={pending} onClick={() => run(() => toggleUserActive(u.id))}>{u.active ? 'ระงับ' : 'เปิดใช้'}</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="section-h" style={{ marginTop: 'var(--space-4)' }}>สิทธิ์เริ่มต้นตามบทบาท (RBAC)</h3>
      <div className="scroll-x">
        <table className={`table ${css.matrix}`}>
          <thead><tr><th>เมนู / ฟังก์ชัน</th>{ROLES.map(([, l]) => <th key={l} style={{ textAlign: 'center' }}>{l}</th>)}</tr></thead>
          <tbody>
            {ALL.map(m => (
              <tr key={m}><td>{MOD_LABEL[m]}</td>{ROLES.map(([r]) => { const on = ROLE_PERMS[r].includes(m); return <td key={r} style={{ textAlign: 'center', color: on ? 'var(--color-accent-700)' : 'var(--color-neutral-400)' }} aria-label={on ? 'มีสิทธิ์' : 'ไม่มีสิทธิ์'}>{on ? '●' : '—'}</td>; })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg?.type === 'new' && <NewUserDialog onClose={() => setDlg(null)} />}
      {dlg?.type === 'perms' && <PermsDialog u={dlg.u} onClose={() => setDlg(null)} />}
    </div>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ role: 'employee', password: '', name: '', username: '', email: '', phone: '', dept: '' });
  const { run, pending, error } = useAction();
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));
  return (
    <Dialog title="สร้างบัญชีผู้ใช้" className={`w560 ${css.dlg}`} onClose={onClose}>
      <div className="grid2">
        <div className="field full"><label htmlFor="nu-name">ชื่อที่แสดง</label><input id="nu-name" className="input" value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="field"><label htmlFor="nu-u">Username</label><input id="nu-u" className="input" value={f.username} onChange={e => set('username', e.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="nu-p">รหัสผ่านเริ่มต้น (อย่างน้อย {MIN_PASSWORD} ตัว)</label><input id="nu-p" className="input" value={f.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" /></div>
        <div className="field"><label htmlFor="nu-email">อีเมลที่ทำงาน (รับแจ้งเตือน / ลืมรหัสผ่าน)</label><input id="nu-email" className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} /></div>
        <div className="field"><label htmlFor="nu-phone">เบอร์โทร</label><input id="nu-phone" className="input" value={f.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" /></div>
        <div className="field"><label htmlFor="nu-dept">แผนก</label><input id="nu-dept" className="input" value={f.dept} onChange={e => set('dept', e.target.value)} /></div>
        <div className="field"><label htmlFor="nu-r">บทบาท</label><select id="nu-r" className="input" value={f.role} onChange={e => set('role', e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => createUser(f), onClose)}>สร้างบัญชี</button>
      </div>
    </Dialog>
  );
}

function PermsDialog({ u, onClose }: { u: U; onClose: () => void }) {
  const [role, setRole] = useState(u.role as Role);
  const [perms, setPerms] = useState<string[]>(u.perms);
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState({ email: u.email, phone: u.phone, dept: u.dept });
  const { run, pending, error } = useAction();
  const setC = (k: keyof typeof contact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact(c => ({ ...c, [k]: e.target.value }));
  return (
    <Dialog title={`กำหนดสิทธิ์ · ${u.name}`} className={`w560 ${css.dlg}`} onClose={onClose}>
      <div className="field"><label htmlFor="pm-r">บทบาท (เปลี่ยนแล้วสิทธิ์จะรีเซ็ตเป็นค่าเริ่มต้นของบทบาท)</label>
        <select id="pm-r" className="input" value={role} onChange={e => { const r = e.target.value as Role; setRole(r); setPerms([...ROLE_PERMS[r]]); }}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div className="col">
        {ALL.map(m => (
          <label key={m} className="perm-row">
            <input type="checkbox" checked={perms.includes(m)} onChange={() => setPerms(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])} />
            <span style={{ flex: 1 }}>{MOD_LABEL[m]}</span>
            {ROLE_PERMS[role]?.includes(m) && <span style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>ค่าเริ่มต้น</span>}
          </label>
        ))}
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="pm-email">อีเมลที่ทำงาน</label><input id="pm-email" className="input" type="email" value={contact.email} onChange={setC('email')} /></div>
        <div className="field"><label htmlFor="pm-phone">เบอร์โทร</label><input id="pm-phone" className="input" value={contact.phone} onChange={setC('phone')} inputMode="tel" /></div>
        <div className="field"><label htmlFor="pm-dept">แผนก</label><input id="pm-dept" className="input" value={contact.dept} onChange={setC('dept')} /></div>
      </div>
      <div className="field"><label htmlFor="pm-p">ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน · อย่างน้อย {MIN_PASSWORD} ตัว)</label><input id="pm-p" className="input" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => savePerms(u.id, role, perms, password, contact), onClose)}>บันทึกสิทธิ์</button>
      </div>
    </Dialog>
  );
}
