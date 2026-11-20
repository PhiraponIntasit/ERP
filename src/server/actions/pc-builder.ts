'use server';
import { db } from '../db';
import { act, Fail, str } from '../act';
import { currentCart, MAX_PER_LINE } from '../cart';
import { getCustomer } from '../customer-session';
import { loadBuild, readSelection, type Selection } from '../pc-builder';
import { SLOTS } from '@/lib/compat';

// Builder actions. The selection comes from the browser, so it is re-read through loadBuild (active products of
// the right category only) and the compatibility rules are checked again here — never trusted from the page.

const MAX_SAVED = 20;
const asSel = (raw: unknown): Selection => readSelection(raw && typeof raw === 'object' ? raw as Record<string, string> : {});

/** Puts one of every part into the cart. Refused if the parts don't fit together or something is out of stock. */
export async function addBuildToCart(raw: Selection) {
  return act(async () => {
    const b = await loadBuild(asSel(raw));
    if (!b.count) throw new Fail('ยังไม่ได้เลือกชิ้นส่วน');
    if (b.hasErrors) throw new Fail('ชิ้นส่วนบางชิ้นใช้ร่วมกันไม่ได้ — แก้ตามรายการที่แจ้งก่อน');
    const parts = SLOTS.map(s => b.parts[s.key]).filter(p => !!p);
    const cart = (await currentCart(true))!;
    await db.$transaction(async tx => {
      const items = await tx.inventoryItem.findMany({ where: { sku: { in: parts.map(p => p.sku) } }, select: { sku: true, name: true, qty: true, reserved: true } });
      const inCart = await tx.cartItem.findMany({ where: { cartId: cart.id, sku: { in: parts.map(p => p.sku) } } });
      const short: string[] = [];
      for (const p of parts) {
        const i = items.find(x => x.sku === p.sku)!;
        const want = (inCart.find(x => x.sku === p.sku)?.qty ?? 0) + 1;
        if (want > i.qty - i.reserved || want > MAX_PER_LINE) short.push(i.name);
      }
      if (short.length) throw new Fail(`สินค้าไม่พอ: ${short.join(', ')} — เปลี่ยนรุ่นหรือลดจำนวนในตะกร้าก่อน`);
      for (const p of parts) {
        await tx.cartItem.upsert({ where: { cartId_sku: { cartId: cart.id, sku: p.sku } }, create: { cartId: cart.id, sku: p.sku, qty: 1 }, update: { qty: { increment: 1 } } });
      }
    });
    return `เพิ่มชุดสเปค ${parts.length} ชิ้นลงตะกร้าแล้ว`;
  });
}

/** Saves the build to the signed-in customer's account. */
export async function saveBuild(raw: Selection, nameIn: string) {
  return act(async () => {
    const me = await getCustomer();
    if (!me) throw new Fail('กรุณาเข้าสู่ระบบเพื่อบันทึกสเปค');
    const b = await loadBuild(asSel(raw));
    if (!b.count) throw new Fail('ยังไม่ได้เลือกชิ้นส่วน');
    const name = str(nameIn).slice(0, 60) || `สเปคคอม ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`;
    if ((await db.pcBuild.count({ where: { customerId: me.id } })) >= MAX_SAVED) throw new Fail(`บันทึกได้สูงสุด ${MAX_SAVED} ชุด — ลบชุดเก่าในบัญชีก่อน`);
    await db.pcBuild.create({
      data: { customerId: me.id, name, items: { create: SLOTS.filter(s => b.parts[s.key]).map(s => ({ slot: s.key, sku: b.parts[s.key]!.sku, qty: 1 })) } },
    });
    return `บันทึก “${name}” แล้ว — ดูได้ที่บัญชีของฉัน › สเปคที่บันทึกไว้`;
  });
}

export async function deleteBuild(id: string) {
  return act(async () => {
    const me = await getCustomer();
    if (!me) throw new Fail('กรุณาเข้าสู่ระบบใหม่');
    const r = await db.pcBuild.deleteMany({ where: { id: str(id), customerId: me.id } });
    if (!r.count) throw new Fail('ไม่พบสเปคนี้');
    return 'ลบสเปคแล้ว';
  });
}
