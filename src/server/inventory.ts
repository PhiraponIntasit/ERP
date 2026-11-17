import 'server-only';
import { num } from './db';
import { lowStock } from './queries';
import type { InvItem } from '@/components/procurement';

export async function invItems(): Promise<{ items: InvItem[]; lowNoPR: InvItem[] }> {
  const { items, open } = await lowStock();
  const out = items.map(i => ({ sku: i.sku, name: i.name, cat: i.cat, unit: i.unit, qty: i.qty, min: i.min, cost: num(i.cost), loc: i.loc, inPR: open.has(i.sku) }));
  return { items: out, lowNoPR: out.filter(i => i.qty <= i.min && !i.inPR) };
}
