'use server';
import type { User } from '@prisma/client';
import { db, nextSeq } from '../db';
import { audit, requireAction } from '../auth';
import { act, Fail, int, str } from '../act';
import { MAX_IMAGE_BYTES, MAX_IMAGES, removeUpload, saveUpload, sniffImage } from '../uploads';
import { CAT_LABEL, ST, URG, WORK_STATUSES } from '@/lib/domain';
import { canTakeWork } from '../assignable';
import { notifyAssigned, notifyClosed, notifyNewTicket, notifyReopened, notifyResolved } from '../notify';

type Saved = { file: string; mime: string; name: string; size: number };

/** Validate (count, size, real image bytes) and store uploaded photos. On failure nothing is left behind. */
async function savePhotos(raw: FormDataEntryValue[]): Promise<Saved[]> {
  const files = raw.filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_IMAGES) throw new Fail(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป`);
  const saved: Saved[] = [];
  try {
    for (const f of files) {
      if (f.size > MAX_IMAGE_BYTES) throw new Fail('ไฟล์รูปใหญ่เกิน 5 MB');
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = sniffImage(buf);
      if (!mime) throw new Fail('รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP, GIF)');
      saved.push({ file: await saveUpload(buf, mime), mime, name: f.name.slice(0, 120), size: f.size });
    }
  } catch (e) {
    await Promise.all(saved.map(s => removeUpload(s.file)));
    throw e;
  }
  return saved;
}

/** Work photos per ticket, across all updates. */
const MAX_WORK_PHOTOS = 24;

export async function createTicket(fd: FormData) {
  return act(async () => {
    const me = await requireAction('ticket_new');
    const title = str(fd.get('title')), desc = str(fd.get('desc')), assetTag = str(fd.get('assetTag')).toUpperCase().slice(0, 40);
    const cat = str(fd.get('cat')), urgency = str(fd.get('urgency'));
    if (!title || !desc) throw new Fail('กรุณากรอกหัวข้อและรายละเอียดปัญหา');
    if (!CAT_LABEL[cat] || !URG[urgency]) throw new Fail('ข้อมูลประเภทหรือความเร่งด่วนไม่ถูกต้อง');
    if (title.length > 200 || desc.length > 5000) throw new Fail('ข้อความยาวเกินไป');

    const saved = await savePhotos(fd.getAll('images'));
    try {
      const id = await db.$transaction(async tx => {
        const id = 'TCK-' + (await nextSeq(tx, 'tck'));
        await tx.ticket.create({ data: {
          id, title, cat, urgency, assetTag, desc, requesterId: me.id, status: 'new',
          images: { create: saved.map((s, ord) => ({ ...s, ord })) },
          history: { create: [{ text: 'เปิดคำร้อง', by: me.name }] },
        } });
        await audit(tx, me, 'ticket', 'เปิดคำร้อง', id, title + ' · ' + URG[urgency][0]);
        return id;
      });
      notifyNewTicket({ id, title, urgency }, me.id, me.name);
    } catch (e) {
      await Promise.all(saved.map(s => removeUpload(s.file)));
      throw e;
    }
    return 'ส่งคำร้องแจ้งซ่อมแล้ว — IT Manager จะมอบหมายช่างให้';
  });
}

export async function assignTicket(tid: string, assigneeId: string) {
  return act(async () => {
    const me = await requireAction('dispatch');
    if (!assigneeId) throw new Fail('กรุณาเลือกช่าง IT Support');
    const t = await db.ticket.findUnique({ where: { id: tid }, include: { assignee: true } });
    if (!t) throw new Fail('ไม่พบคำร้อง');
    if (t.status === 'closed') throw new Fail('งานนี้ปิดแล้ว');
    if (assigneeId === t.assigneeId) throw new Fail('งานนี้มอบหมายให้ช่างคนนี้อยู่แล้ว');
    const tech = await db.user.findUnique({ where: { id: assigneeId } });
    if (!tech || !canTakeWork(tech)) throw new Fail('เลือกได้เฉพาะช่าง IT Support ที่ใช้งานอยู่และมีสิทธิ์รับงาน');
    await db.$transaction(async tx => {
      await tx.ticket.update({ where: { id: tid }, data: {
        assigneeId, status: t.status === 'new' ? 'assigned' : t.status,
        history: { create: { text: 'มอบหมายให้ ' + tech.name, by: me.name } },
      } });
      await audit(tx, me, 'ticket', t.assignee ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายงาน', tid, (t.assignee ? t.assignee.name + ' → ' : '') + tech.name);
    });
    notifyAssigned(t, me.id, tech.id, me.name);
    return `มอบหมาย ${tid} ให้ ${tech.name} แล้ว`;
  });
}

/** IT Support may act on their own assigned tickets; Admin on any assigned ticket. */
async function workTicket(me: User, tid: string) {
  const t = await db.ticket.findUnique({ where: { id: tid } });
  if (!t) throw new Fail('ไม่พบคำร้อง');
  const mine = me.role === 'admin' ? !!t.assigneeId : t.assigneeId === me.id;
  if (!mine) throw new Fail('งานนี้ไม่ได้มอบหมายให้คุณ');
  if (t.status === 'closed') throw new Fail('งานนี้ปิดแล้ว');
  return t;
}

/** Status / note update from the technician, optionally with photos (e.g. before / after the repair). */
export async function updateTicketStatus(tid: string, status: string, rawNote: string, photos?: FormData) {
  return act(async () => {
    const me = await requireAction('tickets_work');
    const t = await workTicket(me, tid);
    const note = str(rawNote).slice(0, 1000);
    const incoming = photos?.getAll('photos') ?? [];
    if (!(WORK_STATUSES as readonly string[]).includes(status)) throw new Fail('สถานะไม่ถูกต้อง');
    if (status === t.status && !note && !incoming.length) throw new Fail('เลือกสถานะใหม่ พิมพ์บันทึก หรือแนบรูปก่อน');
    const already = incoming.length ? await db.ticketImage.count({ where: { ticketId: tid, kind: 'work' } }) : 0;
    if (already + incoming.length > MAX_WORK_PHOTOS) throw new Fail(`งานนี้แนบรูปของช่างได้รวมไม่เกิน ${MAX_WORK_PHOTOS} รูป (แนบไปแล้ว ${already} รูป)`);
    const saved = await savePhotos(incoming);
    const changed = status !== t.status;
    const pics = saved.length ? ` · แนบรูป ${saved.length} รูป` : '';
    try {
      await db.$transaction(async tx => {
        const ord = saved.length ? await tx.ticketImage.count({ where: { ticketId: tid } }) : 0;
        const ev = await tx.ticketEvent.create({ data: { ticketId: tid, by: me.name,
          text: changed || note ? 'อัปเดตสถานะ: ' + ST[status][0] + (note ? ' — ' + note : '') + pics : `แนบรูปการทำงาน ${saved.length} รูป` } });
        await tx.ticket.update({ where: { id: tid }, data: {
          status,
          ...(changed && status === 'resolved' ? { resolvedAt: new Date() } : {}),
          ...(changed && t.status === 'resolved' ? { resolvedAt: null } : {}),
          images: { create: saved.map((s, i) => ({ ...s, ord: ord + i, kind: 'work', eventId: ev.id })) },
        } });
        if (changed) await audit(tx, me, 'ticket', 'อัปเดตสถานะ', tid, ST[t.status][0] + ' → ' + ST[status][0] + (note ? ' · ' + note : '') + pics);
        else await audit(tx, me, 'ticket', saved.length && !note ? 'แนบรูปการทำงาน' : 'บันทึกการทำงาน', tid, (note || '') + pics);
      });
    } catch (e) {
      await Promise.all(saved.map(s => removeUpload(s.file)));
      throw e;
    }
    if (status === 'resolved' && t.status !== 'resolved') notifyResolved(t, me.id, me.name, note);
    return `อัปเดต ${tid} แล้ว`;
  });
}

export async function withdrawPart(tid: string, sku: string, rawQty: string) {
  return act(async () => {
    const me = await requireAction('tickets_work');
    const t = await workTicket(me, tid);
    // Parts belong to the repair: once it's reported fixed, reopen it (status back to in progress) first
    if (t.status === 'resolved') throw new Fail('งานนี้แจ้งว่าแก้ไขเสร็จแล้ว — เปลี่ยนสถานะกลับเป็น "กำลังทำ" ก่อนเบิกอะไหล่');
    const qty = int(rawQty);
    const it = await db.inventoryItem.findUnique({ where: { sku } });
    if (!it) throw new Fail('กรุณาเลือกสินค้า');
    if (!(qty > 0)) throw new Fail('จำนวนต้องมากกว่า 0');
    const after = await db.$transaction(async tx => {
      // Conditional decrement: never goes below zero even with concurrent withdrawals.
      const r = await tx.inventoryItem.updateMany({ where: { sku, qty: { gte: qty } }, data: { qty: { decrement: qty } } });
      if (r.count !== 1) { const cur = await tx.inventoryItem.findUnique({ where: { sku } }); throw new Fail(`สต็อกไม่พอ — คงเหลือ ${cur?.qty ?? 0} ${it.unit}`); }
      const cur = (await tx.inventoryItem.findUnique({ where: { sku } }))!;
      await tx.ticketPart.upsert({ where: { ticketId_sku: { ticketId: tid, sku } }, create: { ticketId: tid, sku, name: it.name, qty }, update: { qty: { increment: qty } } });
      await tx.ticketEvent.create({ data: { ticketId: tid, text: `เบิก ${it.name} × ${qty} จากคลัง`, by: me.name } });
      await tx.stockMove.create({ data: { sku, type: 'out', qty, ref: tid, by: me.name } });
      await audit(tx, me, 'stock', 'เบิกสต็อก', sku, `${it.name} −${qty} · คงเหลือ ${cur.qty + qty} → ${cur.qty} · อ้างอิง ${tid}`);
      return cur;
    });
    return after.qty <= after.min ? `ตัดสต็อกแล้ว · ${it.name} ต่ำกว่าจุดสั่งซื้อ ระบบแจ้งเตือนผู้ดูแลคลังแล้ว` : `ตัดสต็อก ${it.name} × ${qty} แล้ว`;
  });
}

async function ownResolved(me: User, tid: string) {
  const t = await db.ticket.findUnique({ where: { id: tid } });
  if (!t || t.requesterId !== me.id) throw new Fail('ไม่พบคำร้องของคุณ');
  if (t.status !== 'resolved') throw new Fail('คำร้องนี้ยังไม่อยู่ในสถานะรอยืนยัน');
  return t;
}

export async function confirmClose(tid: string, rating: number, rawNote: string) {
  return act(async () => {
    const me = await requireAction('my_tickets');
    const t = await ownResolved(me, tid);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Fail('กรุณาให้คะแนน 1–5 ดาว');
    const note = str(rawNote).slice(0, 1000);
    await db.$transaction(async tx => {
      await tx.ticket.update({ where: { id: tid }, data: {
        status: 'closed', rating, ratingNote: note, closedAt: new Date(),
        history: { create: { text: `ผู้แจ้งยืนยันปิดงาน · ให้คะแนน ${rating}/5` + (note ? ' — ' + note : ''), by: me.name } },
      } });
      await audit(tx, me, 'ticket', 'ยืนยันปิดงาน', tid, `คะแนน ${rating}/5` + (note ? ' · ' + note : ''));
    });
    notifyClosed(t, me.id, me.name, rating, note);
    return `ปิดงาน ${tid} แล้ว ขอบคุณครับ`;
  });
}

export async function reopenTicket(tid: string) {
  return act(async () => {
    const me = await requireAction('my_tickets');
    const t = await ownResolved(me, tid);
    await db.$transaction(async tx => {
      await tx.ticket.update({ where: { id: tid }, data: {
        status: 'progress', resolvedAt: null,
        history: { create: { text: 'ผู้แจ้งแจ้งว่าปัญหายังไม่หาย — เปิดงานต่อ', by: me.name } },
      } });
      await audit(tx, me, 'ticket', 'ปฏิเสธผลการซ่อม (เปิดงานต่อ)', tid);
    });
    notifyReopened(t, me.id, me.name);
    return `ส่ง ${tid} กลับให้ช่างดำเนินการต่อแล้ว`;
  });
}
