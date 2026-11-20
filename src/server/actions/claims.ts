'use server';
import { redirect } from 'next/navigation';
import { act, Fail, str } from '../act';
import { requireAction } from '../auth';
import { getCustomer } from '../customer-session';
import { approveClaim, cancelClaim, receiveClaim, rejectClaim, submitClaim } from '../claims';
import { addClaimNote, assignClaim, attachCustomerPhotos, MAX_CUSTOMER_PHOTOS, MAX_EVENT_PHOTOS, repairClaim } from '../claim-service';
import { dropPhotos, savePhotos, type SavedPhoto } from '../photos';

// ── Customer ──

export type ClaimFormState = { error?: string; values?: { serial: string; problem: string } };

export async function submitClaimForm(_: ClaimFormState, fd: FormData): Promise<ClaimFormState> {
  const values = { serial: str(fd.get('serial')), problem: str(fd.get('problem')) };
  const me = await getCustomer();
  if (!me) redirect('/account/login?next=/account/claims/new');
  let id: string, photos: SavedPhoto[] = [];
  try {
    photos = await savePhotos(fd.getAll('photos'), MAX_CUSTOMER_PHOTOS); // checked before the claim exists, so a bad file files nothing
    id = await submitClaim(me, values.serial, values.problem);
    await attachCustomerPhotos(id, photos);
  } catch (e) {
    await dropPhotos(photos);
    if (e instanceof Fail) return { error: e.message, values };
    console.error(e);
    return { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่', values };
  }
  redirect(`/account/claims?new=${id}`);
}

export async function cancelMyClaim(id: string) {
  return act(async () => {
    const me = await getCustomer();
    if (!me) throw new Fail('กรุณาเข้าสู่ระบบใหม่');
    await cancelClaim(me, id);
    return `ยกเลิกเคลม ${id} แล้ว`;
  });
}

// ── Back office ──

export async function receive(id: string) {
  return act(async () => { const me = await requireAction('claims'); await receiveClaim(me, id); return `รับเครื่องเคลม ${id} แล้ว — แจ้งลูกค้าทางอีเมลแล้ว`; });
}

export async function approve(id: string, newSerial: string, note: string) {
  return act(async () => { const me = await requireAction('claims'); await approveClaim(me, id, newSerial, note); return `อนุมัติเคลม ${id} — เปลี่ยนเครื่องใหม่และตัดสต็อกแล้ว`; });
}

export async function reject(id: string, reason: string) {
  return act(async () => { const me = await requireAction('claims'); await rejectClaim(me, id, reason); return `ไม่อนุมัติเคลม ${id} — แจ้งลูกค้าแล้ว`; });
}

export async function assign(id: string, userId: string) {
  return act(async () => {
    const me = await requireAction('claims');
    const name = await assignClaim(me, id, userId || null);
    return name ? `มอบหมาย ${id} ให้ ${name} แล้ว` : `ยกเลิกการมอบหมาย ${id} แล้ว`;
  });
}

/** Service log entry from the claim page: text, "customer can see" flag and photos in one FormData. */
export async function addNote(id: string, fd: FormData) {
  return act(async () => {
    const me = await requireAction('claims');
    const photos = await savePhotos(fd.getAll('photos'), MAX_EVENT_PHOTOS);
    await addClaimNote(me, id, str(fd.get('text')), fd.get('public') === 'on', photos);
    return 'บันทึกแล้ว';
  });
}

export async function repair(id: string, parts: Record<string, string>, note: string) {
  return act(async () => {
    const me = await requireAction('claims');
    const used = await repairClaim(me, id, parts, note);
    return `ปิดเคลม ${id} — ซ่อมคืนเครื่องเดิม${used.length ? ` ตัดอะไหล่ ${used.length} รายการ` : ''} แจ้งลูกค้าแล้ว`;
  });
}
