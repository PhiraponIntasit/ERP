import 'server-only';
import type { User } from '@prisma/client';
import { db } from './db';
import { Fail, int, str } from './act';
import { audit } from './auth';
import { appUrl, sendMail } from './mail';
import { available, take } from './stock-reserve';
import { dropPhotos, type SavedPhoto } from './photos';
import { fmtDT } from '@/lib/domain';

// After-sales service on a claim (person B): who inspects the unit, the service log the customer follows on the
// storefront (with photos), and the third outcome besides swap/reject — repair and return the customer's own unit,
// with spare parts taken from stock. Swap and reject stay in claims.ts (person A) and replaceUnit() in warranty.ts.

type Staff = Pick<User, 'id' | 'name' | 'role'>;
export const CLAIM_SLA_DAYS = 7;               // from "received" to a decision
export const MAX_CUSTOMER_PHOTOS = 4, MAX_EVENT_PHOTOS = 6, MAX_CLAIM_PHOTOS = 30;
const OPEN = ['submitted', 'received'];

/** Staff who can work on claims, for the assign list. */
export async function claimStaff() {
  return db.user.findMany({ where: { active: true, perms: { has: 'claims' } }, orderBy: [{ role: 'asc' }, { name: 'asc' }], select: { id: true, name: true, role: true } });
}

export async function assignClaim(me: Staff, id: string, userId: string | null) {
  const to = userId ? await db.user.findFirst({ where: { id: userId, active: true, perms: { has: 'claims' } }, select: { id: true, name: true } }) : null;
  if (userId && !to) throw new Fail('ผู้ใช้นี้ไม่มีสิทธิ์งานเคลม');
  await db.$transaction(async tx => {
    const r = await tx.claim.updateMany({ where: { id, status: { in: OPEN } }, data: { assigneeId: to?.id ?? null } });
    if (r.count !== 1) throw new Fail('เคลมนี้ปิดไปแล้ว');
    const c = await tx.claim.findUniqueOrThrow({ where: { id } });
    await tx.claimEvent.create({ data: { claimId: id, by: me.name, public: false, text: to ? `มอบหมายให้ ${to.name} ตรวจสอบ` : 'ยกเลิกการมอบหมาย' } });
    await audit(tx, me, 'warranty', to ? 'มอบหมายช่างตรวจเคลม' : 'ยกเลิกการมอบหมายเคลม', c.serial, [id, to?.name].filter(Boolean).join(' · '));
  });
  return to?.name ?? null;
}

/** A line in the service log, optionally with photos. Public lines appear on the customer's claim page. */
export async function addClaimNote(me: Staff, id: string, textIn: string, isPublic: boolean, photos: SavedPhoto[]) {
  const text = str(textIn).slice(0, 1000);
  try {
    if (!text && !photos.length) throw new Fail('พิมพ์บันทึกหรือแนบรูปอย่างน้อยหนึ่งอย่าง');
    await db.$transaction(async tx => {
      const c = await tx.claim.findUnique({ where: { id }, select: { status: true, serial: true, _count: { select: { images: true } } } });
      if (!c) throw new Fail('ไม่พบเคลมนี้');
      if (!OPEN.includes(c.status)) throw new Fail('เคลมนี้ปิดไปแล้ว');
      if (c._count.images + photos.length > MAX_CLAIM_PHOTOS) throw new Fail(`เคลมหนึ่งเรื่องเก็บรูปได้สูงสุด ${MAX_CLAIM_PHOTOS} รูป`);
      const ev = await tx.claimEvent.create({ data: { claimId: id, by: me.name, public: isPublic, text: text || 'แนบรูป' } });
      await tx.claimImage.createMany({ data: photos.map((p, i) => ({ claimId: id, eventId: ev.id, kind: 'staff', ord: c._count.images + i, ...p })) });
      await audit(tx, me, 'warranty', 'บันทึกงานเคลม', c.serial, `${id} · ${isPublic ? 'ลูกค้าเห็น' : 'ภายใน'}${photos.length ? ` · รูป ${photos.length}` : ''} · ${text.slice(0, 200)}`);
    });
  } catch (e) {
    await dropPhotos(photos);
    throw e;
  }
}

/** Photos the customer attaches when filing (the claim was just created by submitClaim). */
export async function attachCustomerPhotos(id: string, photos: SavedPhoto[]) {
  if (!photos.length) return;
  await db.claimImage.createMany({ data: photos.map((p, i) => ({ claimId: id, kind: 'customer', ord: i, ...p })) });
}

/** Repair and return the customer's own unit: spare parts leave stock (never units held for unpaid orders), the claim closes. */
export async function repairClaim(me: Staff, id: string, partsIn: Record<string, string>, noteIn: string) {
  const note = str(noteIn).slice(0, 500);
  if (note.length < 5) throw new Fail('กรุณาสรุปสิ่งที่ซ่อมให้ลูกค้าทราบ');
  const want = Object.entries(partsIn).map(([sku, q]) => [sku.toUpperCase(), int(q)] as const).filter(([, q]) => q > 0);
  if (want.length > 20) throw new Fail('ใส่อะไหล่ได้ไม่เกิน 20 รายการ');
  const items = await db.inventoryItem.findMany({ where: { sku: { in: want.map(w => w[0]) } } });
  for (const [sku, q] of want) {
    const it = items.find(i => i.sku === sku);
    if (!it) throw new Fail(`ไม่พบสินค้า ${sku}`);
    if (it.serialTracked) throw new Fail(`${it.name} เก็บ Serial รายชิ้น — ใช้เป็นอะไหล่ไม่ได้ (ถ้าต้องเปลี่ยนทั้งเครื่องให้ใช้ "เปลี่ยนเครื่องใหม่")`);
    if (q > 99) throw new Fail(`จำนวน ${it.name} มากเกินไป`);
  }

  const done = await db.$transaction(async tx => {
    // Close first: the conditional update locks the claim row, so a concurrent swap or reject finds it closed.
    const r = await tx.claim.updateMany({ where: { id, status: 'received' }, data: { status: 'repaired', staffNote: note, closedAt: new Date() } });
    if (r.count !== 1) {
      const c = await tx.claim.findUnique({ where: { id }, select: { status: true } });
      throw new Fail(c?.status === 'submitted' ? 'กด "รับเครื่องแล้ว" ก่อน เมื่อได้รับสินค้าจากลูกค้า' : 'สถานะเคลมเปลี่ยนไปแล้ว — โหลดหน้าใหม่');
    }
    const c = await tx.claim.findUniqueOrThrow({ where: { id }, include: { customer: true, unit: { select: { status: true, item: { select: { name: true } } } } } });
    if (c.unit.status !== 'sold') throw new Fail('เครื่องนี้ไม่ได้อยู่กับลูกค้าแล้ว — ซ่อมคืนไม่ได้');
    const used: string[] = [];
    for (const [sku, q] of want) {
      const it = items.find(i => i.sku === sku)!;
      if (!(await take(tx, sku, q))) {
        const cur = await tx.inventoryItem.findUnique({ where: { sku } });
        throw new Fail(`${it.name} เหลือไม่พอ — ใช้ได้ ${cur ? available(cur) : 0} ${it.unit}` + (cur?.reserved ? ` (จองให้คำสั่งซื้อลูกค้า ${cur.reserved})` : ''));
      }
      await tx.claimPart.create({ data: { claimId: id, sku, name: it.name, qty: q } });
      await tx.stockMove.create({ data: { sku, type: 'out', qty: q, ref: id, by: me.name } });
      await audit(tx, me, 'stock', 'เบิกอะไหล่ซ่อมเคลม', sku, `${it.name} −${q} · อ้างอิง ${id}`);
      used.push(`${it.name} × ${q}`);
    }
    await tx.claimEvent.create({ data: { claimId: id, by: me.name, public: true, text: `ซ่อมเสร็จ · ${note}${used.length ? `\nอะไหล่ที่เปลี่ยน: ${used.join(', ')}` : ''}` } });
    await audit(tx, me, 'warranty', 'ซ่อมเคลม · คืนเครื่องเดิม', c.serial, [id, note, used.length ? `อะไหล่ ${used.join(', ')}` : ''].filter(Boolean).join(' · '));
    return { c, used };
  });
  const { c, used } = done;
  const text = [
    `เรียนคุณ${c.customer.name}`, '', `ร้านซ่อม ${c.unit.item.name} (Serial ${c.serial}) เสร็จแล้ว และจะส่งเครื่องเดิมคืนให้`,
    `รายละเอียด: ${note}`, ...(used.length ? [`อะไหล่ที่เปลี่ยน: ${used.join(', ')}`] : []), '', 'ประกันของเครื่องยังนับต่อตามเดิม', `ดูรายละเอียดได้ที่ ${appUrl()}/account/claims`,
  ].join('\n');
  const html = `<div style="font-family:sans-serif;white-space:pre-line">${text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)}</div>`;
  await sendMail(c.customer.email, `ผลการเคลม ${id}: ซ่อมเสร็จแล้ว`, text, html).catch(e => console.error('claim mail failed', e));
  return used;
}

/** Service log for a claim: milestones from the claim's own dates plus the logged events, oldest first. */
export async function claimTimeline(id: string, forCustomer: boolean) {
  const c = await db.claim.findUnique({
    where: { id },
    include: { assignee: { select: { name: true } }, images: { orderBy: [{ ord: 'asc' }] }, events: { where: forCustomer ? { public: true } : {}, orderBy: { t: 'asc' } }, parts: true },
  });
  if (!c) return null;
  const imgs = (eventId: string | null) => c.images.filter(i => (eventId ? i.eventId === eventId : i.kind === 'customer'))
    .map(i => ({ id: i.id, name: i.name, src: `/api/claims/images/${i.id}` }));
  type Line = { key: string; t: Date; by: string; text: string; internal: boolean; photos: { id: string; name: string; src: string }[] };
  const lines: Line[] = [{ key: 'filed', t: c.createdAt, by: 'ลูกค้า', text: 'แจ้งเคลม', internal: false, photos: imgs(null) }];
  if (c.receivedAt) lines.push({ key: 'received', t: c.receivedAt, by: 'ร้าน', text: 'ร้านได้รับเครื่องแล้ว · กำลังตรวจสอบ', internal: false, photos: [] });
  for (const e of c.events) lines.push({ key: e.id, t: e.t, by: forCustomer ? 'ร้าน' : e.by, text: e.text, internal: !e.public, photos: imgs(e.id) });
  if (c.closedAt && c.status !== 'repaired') {
    const text = c.status === 'replaced' ? `อนุมัติ · เปลี่ยนเป็นเครื่องใหม่ (${c.newSerial})` : c.status === 'rejected' ? `ไม่อนุมัติ · ${c.staffNote}` : 'ยกเลิกเคลม';
    lines.push({ key: 'closed', t: c.closedAt, by: c.status === 'cancelled' ? 'ลูกค้า' : 'ร้าน', text, internal: false, photos: [] });
  }
  lines.sort((a, b) => a.t.getTime() - b.t.getTime());
  const age = c.receivedAt && !c.closedAt ? Math.floor((Date.now() - c.receivedAt.getTime()) / 864e5) : null;
  return {
    assignee: c.assignee?.name ?? null, assigneeId: c.assigneeId,
    ageDays: age, overdue: age != null && age >= CLAIM_SLA_DAYS,
    parts: c.parts.map(p => ({ sku: p.sku, name: p.name, qty: p.qty })),
    lines: lines.map(l => ({ ...l, tText: fmtDT(l.t), t: undefined })),
  };
}
export type ClaimTimeline = NonNullable<Awaited<ReturnType<typeof claimTimeline>>>;

/** Non-serial items that can go into a repair, for the parts picker. */
export async function repairParts() {
  const rows = await db.inventoryItem.findMany({ where: { serialTracked: false, qty: { gt: 0 } }, orderBy: { name: 'asc' }, select: { sku: true, name: true, qty: true, reserved: true, unit: true } });
  return rows.filter(r => available(r) > 0).map(r => ({ sku: r.sku, name: r.name, free: available(r), unit: r.unit }));
}
