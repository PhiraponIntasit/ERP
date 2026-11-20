import 'server-only';
import type { User } from '@prisma/client';
import { db, num } from './db';
import { Fail, int, str } from './act';
import { audit } from './auth';
import { available, take } from './stock-reserve';
import { bahtS } from '@/lib/domain';

// Stock adjustments (B): the ways stock changes other than buying and selling. Damaged and lost units are written off,
// and a physical count sets the shelf quantity. Nothing can take away units held for customers' unpaid orders,
// serial-tracked units are written off by serial (status `scrapped`), and every change leaves a stock move and an audit row.
// The storefront reads qty − reserved, so it follows at once.

type Staff = Pick<User, 'id' | 'name' | 'role'>;
export const ADJUST_KINDS = [['damaged', 'ชำรุด / ตัดของเสีย'], ['lost', 'สูญหาย'], ['count', 'ตรวจนับ (ตั้งยอดตามที่นับได้)']] as const;
export type AdjustKind = (typeof ADJUST_KINDS)[number][0];
const isKind = (k: string): k is AdjustKind => ADJUST_KINDS.some(x => x[0] === k);
const LABEL: Record<AdjustKind, string> = { damaged: 'ตัดของเสีย', lost: 'สูญหาย', count: 'ตรวจนับ' };

export async function inStockSerials(sku: string) {
  return (await db.serialNumber.findMany({ where: { sku, status: 'in_stock' }, orderBy: { serial: 'asc' }, select: { serial: true } })).map(s => s.serial);
}

/** `amount` is how many go out for damaged/lost, or the counted quantity for a count. Returns a message for the toast. */
export async function adjustStock(me: Staff, sku: string, kindIn: string, amountIn: string, reasonIn: string, serialsIn: string[] = []) {
  if (!isKind(kindIn)) throw new Fail('เลือกประเภทการปรับยอด');
  const kind = kindIn, amount = int(amountIn), reason = str(reasonIn).slice(0, 200);
  if (reason.length < 5) throw new Fail('กรุณาระบุเหตุผล (อย่างน้อย 5 ตัวอักษร)');
  const it = await db.inventoryItem.findUnique({ where: { sku } });
  if (!it) throw new Fail('ไม่พบสินค้า');
  if (!Number.isInteger(amount) || amount < 0 || (kind !== 'count' && amount === 0)) throw new Fail(kind === 'count' ? 'กรอกจำนวนที่นับได้ (0 ขึ้นไป)' : 'จำนวนต้องมากกว่า 0');
  if (kind === 'count' && it.serialTracked) throw new Fail(`${it.name} เก็บ Serial รายชิ้น — ปรับยอดด้วย "ชำรุด" หรือ "สูญหาย" โดยเลือก Serial หรือรับเข้าพร้อม Serial`);
  const serials = [...new Set(serialsIn.map(s => str(s).toUpperCase()).filter(Boolean))];
  if (it.serialTracked && serials.length !== amount) throw new Fail(`เลือก Serial ให้ครบ ${amount} เครื่อง (เลือกไว้ ${serials.length})`);

  return db.$transaction(async tx => {
    const cur = await tx.inventoryItem.findUniqueOrThrow({ where: { sku } });
    const delta = kind === 'count' ? amount - cur.qty : -amount;
    if (delta === 0) throw new Fail(`ยอดที่นับได้ตรงกับในระบบแล้ว (${cur.qty} ${it.unit})`);
    if (delta < 0) {
      // Conditional decrement: never below zero, never the units reserved for unpaid orders.
      if (!(await take(tx, sku, -delta))) {
        throw new Fail(`ปรับลดได้ไม่เกิน ${available(cur)} ${it.unit}` + (cur.reserved ? ` — อีก ${cur.reserved} ${it.unit} จองให้คำสั่งซื้อที่รอชำระ` : ''));
      }
      if (serials.length) {
        const r = await tx.serialNumber.updateMany({ where: { serial: { in: serials }, sku, status: 'in_stock' }, data: { status: 'scrapped' } });
        if (r.count !== serials.length) throw new Fail('มี Serial ที่ไม่ได้อยู่ในสต็อกของสินค้านี้ — โหลดหน้าใหม่');
      }
    } else {
      await tx.inventoryItem.update({ where: { sku }, data: { qty: { increment: delta } } });
    }
    const ref = `${LABEL[kind]}: ${reason}${serials.length ? ` · Serial ${serials.join(', ')}` : ''}`.slice(0, 300);
    await tx.stockMove.create({ data: { sku, type: delta < 0 ? 'adjust_out' : 'adjust_in', qty: Math.abs(delta), ref, by: me.name } });
    const value = Math.abs(delta) * num(it.cost);
    await audit(tx, me, 'stock', 'ปรับยอดสต็อก', sku, `${it.name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} · คงเหลือ ${cur.qty} → ${cur.qty + delta} · มูลค่าทุน ${bahtS(value)} · ${ref}`);
    return `${LABEL[kind]} ${it.name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${it.unit} · คงเหลือ ${cur.qty + delta} (มูลค่าทุน ${bahtS(value)})`;
  });
}
