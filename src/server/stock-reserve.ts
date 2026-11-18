// Stock reservation: an order awaiting payment holds units (`reserved`) so nobody else can buy or
// withdraw them; payment turns the hold into a sale, expiry or cancellation hands it back.
// Every step is ONE conditional UPDATE, so two people racing for the last unit can't both win, and
// the CHECK (0 <= reserved <= qty) in the database backs it up. Pass the transaction you are in.
// (No 'server-only' import: e2e tests call these directly with their own Prisma client.)
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/** Units that can still be sold or withdrawn. */
export const available = (i: { qty: number; reserved: number }) => i.qty - i.reserved;

/** Hold `n` units for an unpaid order. False when fewer than `n` are available. */
export async function reserve(tx: Db, sku: string, n: number): Promise<boolean> {
  if (!(n > 0)) return false;
  return (await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = "reserved" + ${n} WHERE "sku" = ${sku} AND "qty" - "reserved" >= ${n}`) === 1;
}

/** Give back `n` held units (order expired or cancelled before payment). */
export async function release(tx: Db, sku: string, n: number): Promise<boolean> {
  if (!(n > 0)) return false;
  return (await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${n} WHERE "sku" = ${sku} AND "reserved" >= ${n}`) === 1;
}

/** Payment arrived: the held units leave the store. */
export async function sellReserved(tx: Db, sku: string, n: number): Promise<boolean> {
  if (!(n > 0)) return false;
  return (await tx.$executeRaw`UPDATE "InventoryItem" SET "qty" = "qty" - ${n}, "reserved" = "reserved" - ${n} WHERE "sku" = ${sku} AND "reserved" >= ${n} AND "qty" >= ${n}`) === 1;
}

/** Take `n` units straight out of stock (e.g. a technician's part withdrawal) — never units held for orders. */
export async function take(tx: Db, sku: string, n: number): Promise<boolean> {
  if (!(n > 0)) return false;
  return (await tx.$executeRaw`UPDATE "InventoryItem" SET "qty" = "qty" - ${n} WHERE "sku" = ${sku} AND "qty" - "reserved" >= ${n}`) === 1;
}
