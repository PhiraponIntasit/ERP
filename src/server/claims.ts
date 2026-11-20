import 'server-only';
import type { Customer, Prisma, User } from '@prisma/client';
import { db, nextSeq } from './db';
import { Fail, str } from './act';
import { audit } from './auth';
import { appUrl, sendMail } from './mail';
import { lookupSerial, replaceUnit } from './warranty';
import { CLAIM_SLA_DAYS } from './claim-service';
import { pageOf } from '@/lib/paging';
import { fmtD, fmtDT } from '@/lib/domain';
import { SHOP } from '@/lib/shop';

// Warranty claims (person A). A customer reports a fault on one serial-tracked unit they bought; the shop receives
// the unit, then either swaps it via B's replaceUnit() (which moves stock and serial statuses) or rejects the claim.
// A claim never changes a serial's status itself.

type Staff = Pick<User, 'id' | 'name' | 'role'>;

export const CLAIM_ST: Record<string, [string, string]> = {
  submitted: ['รอส่งเครื่องให้ร้าน', 'tag-accent-2'],
  received: ['ร้านได้รับเครื่อง · กำลังตรวจสอบ', 'tag-accent'],
  replaced: ['เปลี่ยนเครื่องใหม่แล้ว', 'tag-neutral'],
  repaired: ['ซ่อมเสร็จ · คืนเครื่องเดิม', 'tag-neutral'],
  rejected: ['ไม่อนุมัติ', 'tag-outline'],
  cancelled: ['ยกเลิกแล้ว', 'tag-outline'],
};
export const OPEN_CLAIM = ['submitted', 'received'];
export const PROBLEM_MIN = 10, PROBLEM_MAX = 1000;

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const stLabel = (s: string) => CLAIM_ST[s]?.[0] ?? s;
const stTag = (s: string) => CLAIM_ST[s]?.[1] ?? 'tag-neutral';

// ── Customer side ─────────────────────────────────────────────────────────────

/** Units this customer bought that carry a serial, newest first, with whether a claim can be raised on each. */
export async function claimableUnits(customerId: string) {
  const units = await db.serialNumber.findMany({
    where: { orderLine: { order: { customerId } }, status: { in: ['sold', 'claim'] } },
    include: {
      item: { select: { name: true, warrantyMonths: true } },
      orderLine: { select: { order: { select: { id: true, paidAt: true, shippedAt: true } } } },
      claims: { where: { status: { in: OPEN_CLAIM } }, select: { id: true } },
    },
  });
  const now = new Date();
  return units.map(u => {
    const o = u.orderLine!.order;
    const start = o.shippedAt ?? o.paidAt;
    const until = start ? addMonths(start, u.item.warrantyMonths) : null;
    const open = u.claims[0]?.id ?? null;
    const why = u.status !== 'sold' ? 'เปลี่ยนเครื่องไปแล้ว' : open ? `มีเคลม ${open} อยู่แล้ว` : !o.shippedAt ? 'ยังไม่ได้จัดส่ง' : !until || until <= now ? 'หมดประกันแล้ว' : '';
    return { serial: u.serial, name: u.item.name, orderId: o.id, untilText: until ? fmtD(until) : '—', ok: !why, why, at: start?.getTime() ?? 0 };
  }).sort((a, b) => b.at - a.at || a.serial.localeCompare(b.serial));
}

export async function myClaims(customerId: string) {
  const rows = await db.claim.findMany({ where: { customerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { unit: { select: { item: { select: { name: true } } } } } });
  return rows.map(c => ({
    id: c.id, serial: c.serial, name: c.unit.item.name, orderId: c.orderId, problem: c.problem, status: c.status,
    statusLabel: stLabel(c.status), statusTag: stTag(c.status), createdText: fmtDT(c.createdAt), closedText: c.closedAt ? fmtDT(c.closedAt) : '',
    newSerial: c.newSerial, staffNote: c.staffNote,
  }));
}

/** Customer raises a claim on a unit from one of their own orders that is still under warranty. Returns the claim number. */
export async function submitClaim(me: Customer, serialIn: string, problemIn: string) {
  const serial = str(serialIn).toUpperCase(), problem = str(problemIn);
  if (!serial) throw new Fail('กรุณาเลือกสินค้าที่ต้องการเคลม');
  if (problem.length < PROBLEM_MIN) throw new Fail(`กรุณาอธิบายอาการเสียอย่างน้อย ${PROBLEM_MIN} ตัวอักษร`);
  if (problem.length > PROBLEM_MAX) throw new Fail(`อธิบายอาการได้ไม่เกิน ${PROBLEM_MAX} ตัวอักษร`);
  const unit = (await claimableUnits(me.id)).find(u => u.serial === serial);
  if (!unit) throw new Fail('ไม่พบ Serial นี้ในคำสั่งซื้อของคุณ');
  if (!unit.ok) throw new Fail(`แจ้งเคลมไม่ได้: ${unit.why}`);

  const id = await db.$transaction(async tx => {
    // One open claim per unit: lock the serial row so two submissions can't both pass the check.
    await tx.$queryRaw`SELECT "serial" FROM "SerialNumber" WHERE "serial" = ${serial} FOR UPDATE`;
    const open = await tx.claim.findFirst({ where: { serial, status: { in: OPEN_CLAIM } }, select: { id: true } });
    if (open) throw new Fail(`มีเคลม ${open.id} สำหรับเครื่องนี้อยู่แล้ว`);
    const id = `CLM-${new Date().getFullYear()}-${String(await nextSeq(tx, 'clm')).padStart(6, '0')}`;
    await tx.claim.create({ data: { id, customerId: me.id, serial, orderId: unit.orderId, problem } });
    await customerAudit(tx, me, 'ลูกค้าแจ้งเคลม', serial, `${id} · ${unit.name} · คำสั่งซื้อ ${unit.orderId} · ${problem.slice(0, 200)}`);
    return id;
  });
  await mailSafe(me.email, `รับเรื่องเคลม ${id} แล้ว`, [
    `เรียนคุณ${me.name}`, '',
    `ร้านได้รับแจ้งเคลม ${unit.name} (Serial ${serial}) แล้ว`,
    'กรุณาส่งสินค้าพร้อมอุปกรณ์ที่มากับกล่องมาที่ร้าน และเขียนเลขที่เคลมไว้หน้ากล่อง',
    `${SHOP.name} ${SHOP.addr} โทร ${SHOP.phone}`, '',
    `ติดตามสถานะได้ที่ ${appUrl()}/account/claims`,
  ].join('\n'));
  return id;
}

export async function cancelClaim(me: Customer, id: string) {
  await db.$transaction(async tx => {
    const r = await tx.claim.updateMany({ where: { id, customerId: me.id, status: 'submitted' }, data: { status: 'cancelled', closedAt: new Date() } });
    if (r.count !== 1) throw new Fail('ยกเลิกได้เฉพาะเคลมที่ร้านยังไม่ได้รับเครื่อง');
    const c = await tx.claim.findUniqueOrThrow({ where: { id } });
    await customerAudit(tx, me, 'ลูกค้ายกเลิกเคลม', c.serial, id);
  });
}

/** Customers have no staff account, so their audit rows carry the name and email instead of a userId. */
function customerAudit(tx: Prisma.TransactionClient, me: Customer, action: string, target: string, detail: string) {
  return tx.auditLog.create({ data: { userId: null, by: `${me.name} (${me.email})`, role: 'ลูกค้า', cat: 'warranty', action, target, detail } });
}

// ── Back office ───────────────────────────────────────────────────────────────

export const CLAIM_TABS = [['open', 'รอดำเนินการ'], ['mine', 'งานของฉัน'], ['submitted', 'รอรับเครื่อง'], ['received', 'กำลังตรวจสอบ'], ['replaced', 'เปลี่ยนแล้ว'], ['repaired', 'ซ่อมคืนแล้ว'], ['rejected', 'ไม่อนุมัติ'], ['all', 'ทั้งหมด']] as const;
export type ClaimTab = (typeof CLAIM_TABS)[number][0];
export const isClaimTab = (t: string | undefined): t is ClaimTab => CLAIM_TABS.some(x => x[0] === t);
const tabWhere = (t: ClaimTab, meId: string): Prisma.ClaimWhereInput =>
  t === 'all' ? {} : t === 'open' ? { status: { in: OPEN_CLAIM } } : t === 'mine' ? { status: { in: OPEN_CLAIM }, assigneeId: meId } : { status: t };

export async function claimPage(tab: ClaimTab, qIn: string, rawPage?: string, meId = '') {
  const q = qIn.trim();
  const search: Prisma.ClaimWhereInput = q ? { OR: [
    { id: { contains: q, mode: 'insensitive' } }, { serial: { contains: q, mode: 'insensitive' } }, { orderId: { contains: q, mode: 'insensitive' } },
    { customer: { name: { contains: q, mode: 'insensitive' } } }, { customer: { email: { contains: q, mode: 'insensitive' } } },
  ] } : {};
  const where = { AND: [search, tabWhere(tab, meId)] };
  const [total, grouped, mine] = await Promise.all([db.claim.count({ where }), db.claim.groupBy({ by: ['status'], where: search, _count: true }),
    db.claim.count({ where: { AND: [search, tabWhere('mine', meId)] } })]);
  const n = (s: string) => grouped.find(g => g.status === s)?._count ?? 0;
  const counts = Object.fromEntries(CLAIM_TABS.map(([t]) => [t, t === 'all' ? grouped.reduce((a, g) => a + g._count, 0) : t === 'open' ? n('submitted') + n('received') : t === 'mine' ? mine : n(t)])) as Record<ClaimTab, number>;
  const page = pageOf(rawPage, total, 20);
  // Open claims: oldest first (work queue). Closed: newest first.
  const rows = await db.claim.findMany({
    where, skip: page.skip, take: page.size,
    orderBy: tab === 'open' || tab === 'mine' || tab === 'submitted' || tab === 'received' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { customer: { select: { name: true } }, unit: { select: { item: { select: { name: true } } } }, assignee: { select: { name: true } } },
  });
  // Days since the shop received the unit, for claims still waiting on a decision (B: service level).
  const age = (c: { status: string; receivedAt: Date | null }) => c.status === 'received' && c.receivedAt ? Math.floor((Date.now() - c.receivedAt.getTime()) / 864e5) : null;
  return {
    page, counts,
    rows: rows.map(c => ({ id: c.id, createdText: fmtDT(c.createdAt), customer: c.customer.name, name: c.unit.item.name, serial: c.serial, problem: c.problem, statusLabel: stLabel(c.status), statusTag: stTag(c.status),
      assignee: c.assignee?.name ?? '', ageDays: age(c), overdue: (age(c) ?? 0) >= CLAIM_SLA_DAYS })),
  };
}

export async function claimDetail(id: string) {
  const c = await db.claim.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, email: true, phone: true } } } });
  if (!c) return null;
  const unit = await lookupSerial(c.serial);
  return {
    id: c.id, status: c.status, statusLabel: stLabel(c.status), statusTag: stTag(c.status), problem: c.problem, orderId: c.orderId,
    serial: c.serial, newSerial: c.newSerial, staffNote: c.staffNote, customer: c.customer,
    createdText: fmtDT(c.createdAt), receivedText: c.receivedAt ? fmtDT(c.receivedAt) : '', closedText: c.closedAt ? fmtDT(c.closedAt) : '',
    unit,
  };
}
export type ClaimDetail = NonNullable<Awaited<ReturnType<typeof claimDetail>>>;

async function moveClaim(me: Staff, id: string, from: string[], data: Prisma.ClaimUpdateManyMutationInput, action: string, detail: string) {
  return db.$transaction(async tx => {
    const r = await tx.claim.updateMany({ where: { id, status: { in: from } }, data });
    if (r.count !== 1) throw new Fail('สถานะเคลมเปลี่ยนไปแล้ว — โหลดหน้าใหม่');
    const c = await tx.claim.findUniqueOrThrow({ where: { id }, include: { customer: true, unit: { select: { item: { select: { name: true } } } } } });
    await audit(tx, me, 'warranty', action, c.serial, [id, detail].filter(Boolean).join(' · '));
    return c;
  });
}

export async function receiveClaim(me: Staff, id: string) {
  const c = await moveClaim(me, id, ['submitted'], { status: 'received', receivedAt: new Date() }, 'รับเครื่องเคลม', '');
  await mailSafe(c.customer.email, `ร้านได้รับสินค้าเคลม ${id} แล้ว`,
    [`เรียนคุณ${c.customer.name}`, '', `ร้านได้รับ ${c.unit.item.name} (Serial ${c.serial}) แล้ว กำลังตรวจสอบอาการ`, 'จะแจ้งผลทางอีเมลอีกครั้ง', '', `ติดตามสถานะได้ที่ ${appUrl()}/account/claims`].join('\n'));
}

export async function rejectClaim(me: Staff, id: string, reasonIn: string) {
  const reason = str(reasonIn).slice(0, 500);
  if (reason.length < 5) throw new Fail('กรุณาระบุเหตุผลที่ไม่อนุมัติให้ลูกค้าทราบ');
  const c = await moveClaim(me, id, OPEN_CLAIM, { status: 'rejected', staffNote: reason, closedAt: new Date() }, 'ไม่อนุมัติเคลม', reason);
  await mailSafe(c.customer.email, `ผลการเคลม ${id}: ไม่อนุมัติ`,
    [`เรียนคุณ${c.customer.name}`, '', `ร้านตรวจสอบ ${c.unit.item.name} (Serial ${c.serial}) แล้ว ไม่สามารถเปลี่ยนเครื่องได้`, `เหตุผล: ${reason}`, '', `สอบถามเพิ่มเติม โทร ${SHOP.phone}`].join('\n'));
}

/** Approve: swap the unit through B's replaceUnit (stock, serial statuses and its own audit row), then close the claim. */
export async function approveClaim(me: Staff, id: string, newSerialIn: string, noteIn: string) {
  const newSerial = str(newSerialIn).toUpperCase(), note = str(noteIn).slice(0, 300);
  const c = await db.claim.findUnique({ where: { id } });
  if (!c) throw new Fail('ไม่พบเคลมนี้');
  if (c.status !== 'received') throw new Fail(c.status === 'submitted' ? 'กด "รับเครื่องแล้ว" ก่อน เมื่อได้รับสินค้าจากลูกค้า' : 'เคลมนี้ปิดไปแล้ว');
  // One transaction: close the claim first (its conditional update locks the row, so a concurrent reject waits and then
  // finds it closed), then swap through B's replaceUnit. If the swap fails, the claim stays `received`.
  const done = await db.$transaction(async tx => {
    const r = await tx.claim.updateMany({ where: { id, status: 'received' }, data: { status: 'replaced', newSerial, staffNote: note, closedAt: new Date() } });
    if (r.count !== 1) throw new Fail('สถานะเคลมเปลี่ยนไปแล้ว — โหลดหน้าใหม่');
    await replaceUnit(me, c.serial, newSerial, `เคลม ${id} · ${c.problem}`.slice(0, 300), tx);
    await audit(tx, me, 'warranty', 'อนุมัติเคลม · เปลี่ยนเครื่อง', c.serial, [id, `เครื่องใหม่ ${newSerial}`, note].filter(Boolean).join(' · '));
    return tx.claim.findUniqueOrThrow({ where: { id }, include: { customer: true, unit: { select: { item: { select: { name: true } } } } } });
  });
  await mailSafe(done.customer.email, `ผลการเคลม ${id}: เปลี่ยนเครื่องใหม่ให้แล้ว`,
    [`เรียนคุณ${done.customer.name}`, '', `ร้านเปลี่ยน ${done.unit.item.name} ให้แล้ว`, `เครื่องเดิม Serial ${c.serial} → เครื่องใหม่ Serial ${newSerial}`, ...(note ? [`หมายเหตุ: ${note}`] : []), '', 'ประกันของเครื่องใหม่นับต่อจากเครื่องเดิม'].join('\n'));
}

async function mailSafe(to: string, subject: string, text: string) {
  try {
    const html = `<div style="font-family:sans-serif;white-space:pre-line">${text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)}</div>`;
    await sendMail(to, subject, text, html);
  } catch (e) { console.error('claim mail failed', e); }
}
