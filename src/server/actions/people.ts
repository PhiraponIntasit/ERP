'use server';
import bcrypt from 'bcryptjs';
import { db, nextSeq } from '../db';
import { audit, requireAction } from '../auth';
import { act, Fail, str } from '../act';
import { ALL, ASSET_TYPES, DEPTS, EMP_F, isModule, isRole, MOD_LABEL, ROLE_LABEL, ROLE_PERMS } from '@/lib/domain';

// ── employees ──

export async function saveEmployee(empId: string | null, f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('employees');
    const data = { name: str(f.name), position: str(f.position), dept: str(f.dept) || 'IT', email: str(f.email), phone: str(f.phone) };
    if (!data.name) throw new Fail('กรุณากรอกชื่อ');
    if (!DEPTS.includes(data.dept)) throw new Fail('แผนกไม่ถูกต้อง');
    await db.$transaction(async tx => {
      if (empId) {
        const e = await tx.employee.findUnique({ where: { id: empId } });
        if (!e) throw new Fail('ไม่พบพนักงาน');
        const ch = (Object.keys(data) as (keyof typeof data)[]).filter(k => (e[k] || '') !== data[k]).map(k => `${EMP_F[k]}: ${e[k] || '—'} → ${data[k] || '—'}`);
        await tx.employee.update({ where: { id: empId }, data });
        await audit(tx, me, 'employee', 'แก้ไขข้อมูลพนักงาน', empId + ' ' + data.name, ch.join(' · ') || 'ไม่มีการเปลี่ยนแปลง');
      } else {
        const id = 'EMP-' + String(await nextSeq(tx, 'emp')).padStart(4, '0');
        await tx.employee.create({ data: { id, ...data } });
        await audit(tx, me, 'employee', 'เพิ่มพนักงาน', id + ' ' + data.name, data.dept + (data.position ? ' · ' + data.position : ''));
      }
    });
    return empId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มพนักงานแล้ว';
  });
}

export async function deleteEmployee(empId: string) {
  return act(async () => {
    const me = await requireAction('employees');
    await db.$transaction(async tx => {
      const e = await tx.employee.findUnique({ where: { id: empId }, include: { assets: true } });
      if (!e) throw new Fail('ไม่พบพนักงาน');
      // Held devices go back to IT storage rather than disappearing with the record.
      for (const a of e.assets) {
        await tx.asset.update({ where: { tag: a.tag }, data: { holderId: null, history: { create: { text: 'รับคืนอัตโนมัติ (ลบข้อมูลพนักงาน ' + e.name + ')', by: me.name } } } });
      }
      await tx.employee.delete({ where: { id: empId } });
      await audit(tx, me, 'employee', 'ลบข้อมูลพนักงาน', empId + ' ' + e.name, e.assets.length ? 'คืนอุปกรณ์เข้าทะเบียน ' + e.assets.map(a => a.tag).join(', ') : '');
    });
    return 'ลบข้อมูลพนักงานแล้ว';
  });
}

// ── assets ──

/** Hand a device to an employee — picks an existing free asset by tag, or registers a new one. */
export async function handoverAsset(empId: string, f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('employees');
    const tag = str(f.tag).toUpperCase();
    if (!tag) throw new Fail('กรอก Asset Tag');
    const emp = await db.employee.findUnique({ where: { id: empId } });
    if (!emp) throw new Fail('ไม่พบพนักงาน');
    await db.$transaction(async tx => {
      let a = await tx.asset.findUnique({ where: { tag }, include: { holder: true } });
      if (a?.holderId) throw new Fail(`Asset ${tag} ถูกถือครองโดย ${a.holder?.name ?? a.holderId} อยู่แล้ว`);
      if (!a) {
        const model = str(f.model), type = ASSET_TYPES.includes(str(f.type)) ? str(f.type) : 'Notebook';
        if (!model) throw new Fail('อุปกรณ์ใหม่ — กรอกรุ่นด้วย');
        a = await tx.asset.create({ data: { tag, type, model, history: { create: { text: 'ลงทะเบียนอุปกรณ์', by: me.name } } }, include: { holder: true } });
        await audit(tx, me, 'asset', 'ลงทะเบียนอุปกรณ์', tag, type + ' · ' + model);
      }
      // holderId: null in the filter makes the hand-over atomic (one holder per tag)
      const r = await tx.asset.updateMany({ where: { tag, holderId: null }, data: { holderId: empId } });
      if (r.count !== 1) throw new Fail(`Asset ${tag} ถูกถือครองอยู่แล้ว`);
      await tx.assetEvent.create({ data: { assetTag: tag, text: 'ส่งมอบให้ ' + emp.name, by: me.name } });
      await audit(tx, me, 'asset', 'ส่งมอบอุปกรณ์', tag, '→ ' + emp.name + ' (' + empId + ')');
    });
  });
}

export async function returnAsset(tag: string) {
  return act(async () => {
    const me = await requireAction('employees', 'assets');
    await db.$transaction(async tx => {
      const a = await tx.asset.findUnique({ where: { tag }, include: { holder: true } });
      if (!a || !a.holderId) throw new Fail('อุปกรณ์นี้ไม่ได้ถูกถือครอง');
      const who = a.holder?.name ?? a.holderId;
      await tx.asset.update({ where: { tag }, data: { holderId: null, history: { create: { text: 'รับคืนจาก ' + who, by: me.name } } } });
      await audit(tx, me, 'asset', 'รับคืนอุปกรณ์', tag, who + ' → คลัง IT');
    });
    return `รับคืน ${tag} เข้าคลัง IT แล้ว`;
  });
}

export async function registerAsset(f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('assets');
    const tag = str(f.tag).toUpperCase(), model = str(f.model);
    if (!tag || !model) throw new Fail('กรอก Asset Tag และรุ่น');
    if (!/^[A-Z0-9._-]{1,32}$/.test(tag)) throw new Fail('Asset Tag ใช้ได้เฉพาะ A–Z, 0–9, . _ -');
    if (await db.asset.findUnique({ where: { tag } })) throw new Fail('Asset Tag นี้มีในทะเบียนแล้ว');
    const type = ASSET_TYPES.includes(str(f.type)) ? str(f.type) : 'Notebook';
    const w = str(f.warranty);
    const warrantyEnd = /^\d{4}-\d{2}-\d{2}$/.test(w) ? new Date(w) : null;
    const emp = str(f.holder) ? await db.employee.findUnique({ where: { id: str(f.holder) } }) : null;
    await db.$transaction(async tx => {
      const hist = [{ text: 'ลงทะเบียนอุปกรณ์', by: me.name }];
      if (emp) hist.push({ text: 'ส่งมอบให้ ' + emp.name, by: me.name });
      await tx.asset.create({ data: { tag, type, model, serial: str(f.serial), warrantyEnd, holderId: emp?.id ?? null, history: { create: hist } } });
      await audit(tx, me, 'asset', 'ลงทะเบียนอุปกรณ์', tag, `${type} · ${model}` + (emp ? ' → ' + emp.name : ''));
    });
    return `ลงทะเบียน ${tag} แล้ว`;
  });
}

// ── user accounts & permissions ──

export async function createUser(f: Record<string, string>) {
  return act(async () => {
    const me = await requireAction('users');
    const name = str(f.name), username = str(f.username).toLowerCase(), password = String(f.password ?? '');
    const role = isRole(str(f.role)) ? str(f.role) as keyof typeof ROLE_PERMS : 'employee';
    const empId = str(f.empId) || null;
    if (!name || !username) throw new Fail('กรอกชื่อและ Username');
    if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Fail('Username ใช้ได้เฉพาะ a–z, 0–9, . _ - (2–32 ตัว)');
    if (await db.user.findUnique({ where: { username } })) throw new Fail('Username นี้ถูกใช้แล้ว');
    if (password.length < 4) throw new Fail('รหัสผ่านอย่างน้อย 4 ตัวอักษร');
    if (empId) {
      if (!(await db.employee.findUnique({ where: { id: empId } }))) throw new Fail('ไม่พบพนักงาน');
      if (await db.user.findUnique({ where: { empId } })) throw new Fail('พนักงานคนนี้มีบัญชีผู้ใช้แล้ว');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.$transaction(async tx => {
      await tx.user.create({ data: { username, passwordHash, name, role, empId, perms: [...ROLE_PERMS[role]] } });
      await audit(tx, me, 'user', 'สร้างบัญชีผู้ใช้', username, 'บทบาท ' + ROLE_LABEL[role]);
    });
    return `สร้างบัญชี ${username} แล้ว`;
  });
}

export async function savePerms(userId: string, roleIn: string, permsIn: string[], password: string) {
  return act(async () => {
    const me = await requireAction('users');
    if (!isRole(roleIn)) throw new Fail('บทบาทไม่ถูกต้อง');
    const np = ALL.filter(m => (permsIn ?? []).filter(isModule).includes(m));
    if (userId === me.id && !np.includes('users')) throw new Fail('ไม่สามารถถอดสิทธิ์จัดการผู้ใช้ของตัวเองได้');
    if (!np.length) throw new Fail('ต้องมีสิทธิ์อย่างน้อย 1 เมนู');
    if (password && password.length < 4) throw new Fail('รหัสผ่านอย่างน้อย 4 ตัวอักษร');
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u) throw new Fail('ไม่พบผู้ใช้');
    const ch = [...np.filter(m => !u.perms.includes(m)).map(m => '+' + MOD_LABEL[m]), ...u.perms.filter(isModule).filter(m => !np.includes(m)).map(m => '−' + MOD_LABEL[m])];
    const parts: string[] = [];
    if (u.role !== roleIn) parts.push('บทบาท ' + (ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role) + ' → ' + ROLE_LABEL[roleIn]);
    if (ch.length) parts.push(ch.join(', '));
    if (password) parts.push('รีเซ็ตรหัสผ่าน');
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { role: roleIn, perms: np, ...(passwordHash ? { passwordHash } : {}) } });
      // A reset password signs the person out everywhere (except the admin doing it on themselves).
      if (passwordHash && userId !== me.id) await tx.session.deleteMany({ where: { userId } });
      await audit(tx, me, 'user', 'แก้ไขสิทธิ์ผู้ใช้', u.username, parts.join(' · ') || 'ไม่มีการเปลี่ยนแปลง');
    });
    return 'บันทึกสิทธิ์แล้ว';
  });
}

export async function toggleUserActive(userId: string) {
  return act(async () => {
    const me = await requireAction('users');
    if (userId === me.id) throw new Fail('ไม่สามารถระงับบัญชีของตัวเองได้');
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u) throw new Fail('ไม่พบผู้ใช้');
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { active: !u.active } });
      if (u.active) await tx.session.deleteMany({ where: { userId } });
      await audit(tx, me, 'user', u.active ? 'ระงับบัญชี' : 'เปิดใช้บัญชี', u.username);
    });
    return u.active ? `ระงับบัญชี ${u.username}` : `เปิดใช้บัญชี ${u.username}`;
  });
}
