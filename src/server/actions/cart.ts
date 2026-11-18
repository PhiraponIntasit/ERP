'use server';
import { db } from '../db';
import { act, Fail, int, str } from '../act';
import { currentCart, MAX_PER_LINE } from '../cart';
import { available } from '../stock-reserve';

// Cart changes from the storefront. Quantities are checked against what can be sold now (qty − reserved);
// prices are never taken from the browser — checkout reads them from the database.

async function sellable(sku: string) {
  const i = await db.inventoryItem.findUnique({ where: { sku: str(sku) }, select: { sku: true, name: true, active: true, qty: true, reserved: true } });
  if (!i || !i.active) throw new Fail('ไม่พบสินค้านี้ในร้าน');
  return { ...i, free: Math.max(0, available(i)) };
}

export async function addToCart(sku: string, rawQty: number) {
  return act(async () => {
    const n = int(rawQty);
    if (!(n >= 1)) throw new Fail('จำนวนไม่ถูกต้อง');
    const i = await sellable(sku);
    if (i.free === 0) throw new Fail('สินค้าหมด');
    const cart = (await currentCart(true))!;
    const had = (await db.cartItem.findUnique({ where: { cartId_sku: { cartId: cart.id, sku: i.sku } } }))?.qty ?? 0;
    const qty = had + n;
    if (qty > i.free) throw new Fail(had ? `ในตะกร้ามีแล้ว ${had} ชิ้น — เพิ่มได้อีก ${Math.max(0, i.free - had)} ชิ้น` : `เหลือเพียง ${i.free} ชิ้น`);
    if (qty > MAX_PER_LINE) throw new Fail(`สั่งได้สูงสุด ${MAX_PER_LINE} ชิ้นต่อรายการ`);
    await db.cartItem.upsert({ where: { cartId_sku: { cartId: cart.id, sku: i.sku } }, create: { cartId: cart.id, sku: i.sku, qty }, update: { qty } });
    return `เพิ่ม ${i.name} ลงตะกร้าแล้ว`;
  });
}

/** New quantity for a line; 0 removes it. */
export async function setCartQty(sku: string, rawQty: number) {
  return act(async () => {
    const qty = int(rawQty);
    if (!(qty >= 0)) throw new Fail('จำนวนไม่ถูกต้อง');
    const cart = await currentCart();
    if (!cart) throw new Fail('ตะกร้าว่าง');
    const key = { cartId_sku: { cartId: cart.id, sku: str(sku) } };
    if (qty === 0) { await db.cartItem.deleteMany({ where: { cartId: cart.id, sku: str(sku) } }); return; }
    const i = await sellable(sku);
    if (qty > i.free) throw new Fail(i.free ? `เหลือเพียง ${i.free} ชิ้น` : 'สินค้าหมด');
    if (qty > MAX_PER_LINE) throw new Fail(`สั่งได้สูงสุด ${MAX_PER_LINE} ชิ้นต่อรายการ`);
    await db.cartItem.update({ where: key, data: { qty } });
  });
}
