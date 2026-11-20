'use server';
import { act, Fail } from '../act';
import { requireAction } from '../auth';
import { lookupSerial, replaceUnit, returnToSupplier } from '../warranty';

export async function replace(oldSerial: string, newSerial: string, note: string) {
  return act(async () => {
    const me = await requireAction('warranty');
    // A unit with an open customer claim is swapped from the claim, so the claim closes with it
    const open = (await lookupSerial(oldSerial))?.openClaim;
    if (open) throw new Fail(`เครื่องนี้มีเคลม ${open} เปิดอยู่ — เปลี่ยนเครื่องที่หน้าเคลมเพื่อปิดเคลมพร้อมกัน`);
    await replaceUnit(me, oldSerial, newSerial, note);
    return 'เปลี่ยนสินค้าแล้ว — เครื่องใหม่ตัดจากสต็อก เครื่องเดิมรอส่งคืนผู้ขาย';
  });
}

export async function rma(serial: string, ref: string) {
  return act(async () => { const me = await requireAction('warranty'); await returnToSupplier(me, serial, ref); return 'บันทึกส่งคืนผู้ขายแล้ว'; });
}
