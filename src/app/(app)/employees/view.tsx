'use client';
import { useState } from 'react';
import { deleteEmployee, handoverAsset, returnAsset, saveEmployee } from '@/server/actions/people';
import { useAction } from '@/components/use-action';
import { Dialog, Err } from '@/components/dialog';
import { ASSET_TYPES, DEPTS } from '@/lib/domain';
import { ScanButton } from '@/components/barcode-scanner';
import css from '@/components/people-tables.module.css';

type A = { tag: string; type: string; model: string };
type Emp = { id: string; name: string; position: string; dept: string; email: string; phone: string; assets: A[] };
type Dlg = null | { type: 'emp'; emp: Emp | null } | { type: 'del'; emp: Emp } | { type: 'assets'; empId: string };

export function EmployeesView({ emps, free }: { emps: Emp[]; free: A[] }) {
  const [q, setQ] = useState(''), [dept, setDept] = useState('all');
  const [dlg, setDlg] = useState<Dlg>(null);
  const s = q.trim().toLowerCase();
  const rows = emps.filter(e => (dept === 'all' || e.dept === dept) && (!s || (e.name + e.id + e.email + e.assets.map(a => a.tag + a.model).join('')).toLowerCase().includes(s)));
  const close = () => setDlg(null);
  return (
    <div className="anim-page stack-4">
      <div className={`toolbar ${css.toolbar}`}>
        <input className={`input ${css.search}`} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ, รหัส, อีเมล, Asset Tag" aria-label="ค้นหาพนักงาน" />
        <div className={css.chips} role="group" aria-label="กรองตามแผนก">
          {['all', ...DEPTS].map(d => (
            <button key={d} className={`chip sm${dept === d ? ' on' : ''}`} aria-pressed={dept === d} onClick={() => setDept(d)}>
              {d === 'all' ? `ทั้งหมด (${emps.length})` : `${d} (${emps.filter(e => e.dept === d).length})`}
            </button>
          ))}
        </div>
        <button className="btn btn-primary ml-auto" onClick={() => setDlg({ type: 'emp', emp: null })}>+ เพิ่มพนักงาน</button>
      </div>
      <div className="scroll-x">
        <table className={`table ${css.cards}`}>
          <thead><tr><th>พนักงาน</th><th>รหัส</th><th>แผนก</th><th>ติดต่อ</th><th>อุปกรณ์ที่ถือครอง</th><th className="r">จัดการ</th></tr></thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td className={css.main}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="avatar sm">{e.name.charAt(0)}</span><div><div>{e.name}</div><div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{e.position}</div></div></div></td>
                <td className={`tnum ${css.side}`} style={{ fontSize: 13 }}>{e.id}</td>
                <td data-label="แผนก" style={{ fontSize: 13 }}>{e.dept}</td>
                <td data-label="ติดต่อ" style={{ fontSize: 12 }}><div><div>{e.email}</div>{e.phone && <a className={`muted tnum ${css.phone}`} href={`tel:${e.phone.replace(/[^\d+]/g, '')}`}>{e.phone}</a>}</div></td>
                <td data-label="อุปกรณ์"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 320 }}>
                  {e.assets.map(a => <span key={a.tag} className="tag tag-neutral" title={a.tag}>{a.type} · {a.model}</span>)}
                  {!e.assets.length && <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>ไม่มี</span>}
                </div></td>
                <td className={`r ${css.actions}`}><div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setDlg({ type: 'assets', empId: e.id })}>อุปกรณ์ ({e.assets.length})</button>
                  <button className="btn btn-ghost" onClick={() => setDlg({ type: 'emp', emp: e })}>แก้ไข</button>
                  <button className="btn btn-ghost" style={{ color: 'var(--color-neutral-700)' }} onClick={() => setDlg({ type: 'del', emp: e })}>ลบ</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dlg?.type === 'emp' && <EmpDialog emp={dlg.emp} onClose={close} />}
      {dlg?.type === 'del' && <DelDialog emp={dlg.emp} onClose={close} />}
      {dlg?.type === 'assets' && emps.find(e => e.id === dlg.empId) && <AssetsDialog emp={emps.find(e => e.id === dlg.empId)!} free={free} onClose={close} />}
    </div>
  );
}

function EmpDialog({ emp, onClose }: { emp: Emp | null; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>(emp ? { name: emp.name, position: emp.position, dept: emp.dept, email: emp.email, phone: emp.phone } : { dept: 'IT' });
  const { run, pending, error } = useAction();
  const inp = (k: string, label: string, cls = '') => <div className={`field ${cls}`}><label htmlFor={'e-' + k}>{label}</label><input id={'e-' + k} className="input" value={f[k] ?? ''} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} /></div>;
  return (
    <Dialog title={emp ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน'} className={`w560 ${css.dlg}`} onClose={onClose}>
      <div className="grid2">
        {inp('name', 'ชื่อ-นามสกุล', 'full')}
        {inp('position', 'ตำแหน่ง')}
        <div className="field"><label htmlFor="e-dept">แผนก</label><select id="e-dept" className="input" value={f.dept} onChange={e => setF(x => ({ ...x, dept: e.target.value }))}>{DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        {inp('email', 'อีเมล')}
        {inp('phone', 'โทรศัพท์')}
      </div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveEmployee(emp?.id ?? null, f), onClose)}>บันทึก</button>
      </div>
    </Dialog>
  );
}

function DelDialog({ emp, onClose }: { emp: Emp; onClose: () => void }) {
  const { run, pending, error } = useAction();
  return (
    <Dialog title="ลบข้อมูลพนักงาน" className={css.dlg} onClose={onClose}>
      <div className="dialog-body">ลบ “{emp.name}” ออกจากระบบ? {emp.assets.length ? `พนักงานยังถือครองอุปกรณ์ ${emp.assets.length} รายการ — ระบบจะรับคืนเข้าคลัง IT อัตโนมัติ` : ''}</div>
      <Err msg={error} />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => deleteEmployee(emp.id), onClose)}>ลบ</button>
      </div>
    </Dialog>
  );
}

function AssetsDialog({ emp, free, onClose }: { emp: Emp; free: A[]; onClose: () => void }) {
  const [f, setF] = useState({ type: 'Notebook', model: '', tag: '' });
  const [note, setNote] = useState('');
  const give = useAction();
  // A scanned sticker: a free device fills in its details; anything else just fills the tag
  const onScan = (tag: string) => {
    give.setError(''); setNote('');
    const a = free.find(x => x.tag === tag);
    if (a) return setF({ tag: a.tag, model: a.model, type: a.type });
    setF(x => ({ ...x, tag, model: '' }));
    if (emp.assets.some(x => x.tag === tag)) give.setError(`${tag} อยู่กับ ${emp.name} แล้ว`);
    else setNote(`${tag} ไม่อยู่ในรายการอุปกรณ์ว่าง — ถ้าเป็นเครื่องใหม่ เลือกประเภทและกรอกรุ่นเพื่อลงทะเบียนพร้อมส่งมอบ`);
  };
  const back = useAction({ errorAs: 'toast' });
  return (
    <Dialog title={`อุปกรณ์ที่ถือครอง · ${emp.name}`} className={`w800 ${css.dlg}`} onClose={onClose}>
      <div className="col">
        {emp.assets.map(a => (
          <div key={a.tag} className={css.held}>
            <span className="tnum" style={{ fontSize: 12 }}>{a.tag}</span><span>{a.type} · {a.model}</span>
            <button className="btn btn-ghost" style={{ color: 'var(--color-neutral-700)' }} disabled={back.pending} onClick={() => back.run(() => returnAsset(a.tag))}>คืนอุปกรณ์</button>
          </div>
        ))}
        {!emp.assets.length && <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', padding: '8px 0' }}>ยังไม่มีอุปกรณ์</div>}
      </div>
      {free.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>อุปกรณ์ว่างในทะเบียน — คลิกเพื่อเลือก:</span>
          {free.map(a => <button key={a.tag} className="tag tag-outline" style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { setF({ tag: a.tag, model: a.model, type: a.type }); give.setError(''); setNote(''); }}>{a.tag} · {a.model}</button>)}
        </div>
      )}
      <div className={css.handover}>
        <div className="field"><label htmlFor="h-type">ประเภท</label><select id="h-type" className="input" value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value }))}>{ASSET_TYPES.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        <div className="field"><label htmlFor="h-model">รุ่น</label><input id="h-model" className="input" value={f.model} onChange={e => setF(x => ({ ...x, model: e.target.value }))} placeholder="เช่น MacBook Air M3" /></div>
        <div className="field"><label htmlFor="h-tag">Asset Tag</label><div className={css.tagRow}><input id="h-tag" className="input" value={f.tag} onChange={e => setF(x => ({ ...x, tag: e.target.value }))} placeholder="NB-0130" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /><ScanButton onScan={onScan} /></div></div>
        <button className="btn btn-primary" disabled={give.pending} onClick={() => give.run(() => handoverAsset(emp.id, f), () => { setF(x => ({ ...x, model: '', tag: '' })); setNote(''); })}>ส่งมอบ</button>
      </div>
      {note && !give.error && <div className="dialog-body" role="status">{note}</div>}
      <Err msg={give.error} />
      <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}>ปิด</button></div>
    </Dialog>
  );
}
