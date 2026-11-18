'use server';
import { redirect } from 'next/navigation';
import { db } from '../db';
import { createCustomerSession } from '../customer-session';
import { config } from '@/lib/domain';

// Presentation helper, like the one-click staff demo accounts: only when SHOW_DEMO_ACCOUNTS=true.
// Signs in as the seeded demo customer and, if their cart is empty, puts a CPU and two HDMI cables in it.
// Person A's customer sign-in replaces this for real use.
const DEMO_CART: [string, number][] = [['CPU-R5-7600', 1], ['HDMI-2M', 2]];

export async function enterDemoShop() {
  if (!config.showDemo()) redirect('/login');
  const c = await db.customer.findUnique({ where: { email: 'customer@example.com' } });
  if (!c || !c.active) redirect('/demo-shop?missing=1');
  const cart = await db.cart.upsert({ where: { customerId: c.id }, create: { customerId: c.id }, update: {}, include: { items: true } });
  if (!cart.items.length) {
    const ok = await db.inventoryItem.findMany({ where: { sku: { in: DEMO_CART.map(x => x[0]) }, active: true }, select: { sku: true, qty: true, reserved: true } });
    const free = new Map(ok.map(i => [i.sku, i.qty - i.reserved]));
    await db.cartItem.createMany({ data: DEMO_CART.filter(([sku, n]) => (free.get(sku) ?? 0) >= n).map(([sku, qty]) => ({ cartId: cart.id, sku, qty })) });
  }
  await createCustomerSession(c.id);
  redirect('/checkout');
}
