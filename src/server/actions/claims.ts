'use server';
import { redirect } from 'next/navigation';
import { act, Fail, str } from '../act';
import { requireAction } from '../auth';
import { getCustomer } from '../customer-session';
import { approveClaim, cancelClaim, receiveClaim, rejectClaim, submitClaim } from '../claims';

// ── Customer ──

export type ClaimFormState = { error?: string; values?: { serial: string; problem: string } };

export async function submitClaimForm(_: ClaimFormState, fd: FormData): Promise<ClaimFormState> {
  const values = { serial: str(fd.get('serial')), problem: str(fd.get('problem')) };
  const me = await getCustomer();
  if (!me) redirect('/account/login?next=/account/claims/new');
  let id: string;
  try {
    id = await submitClaim(me, values.serial, values.problem);
  } catch (e) {
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
