'use server';
import { act } from '../act';
import { requireAction } from '../auth';
import { replaceUnit, returnToSupplier } from '../warranty';

export async function replace(oldSerial: string, newSerial: string, note: string) {
  return act(async () => { const me = await requireAction('warranty'); await replaceUnit(me, oldSerial, newSerial, note); return 'เปลี่ยนสินค้าแล้ว — เครื่องใหม่ตัดจากสต็อก เครื่องเดิมรอส่งคืนผู้ขาย'; });
}

export async function rma(serial: string, ref: string) {
  return act(async () => { const me = await requireAction('warranty'); await returnToSupplier(me, serial, ref); return 'บันทึกส่งคืนผู้ขายแล้ว'; });
}
