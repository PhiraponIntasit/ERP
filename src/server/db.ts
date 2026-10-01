import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = db;

export type Tx = Prisma.TransactionClient;

/** Atomically take the next value of a document sequence. */
export async function nextSeq(tx: Tx, key: string): Promise<number> {
  const c = await tx.counter.update({ where: { key }, data: { value: { increment: 1 } } });
  return c.value - 1;
}

export const num = (d: Prisma.Decimal | number) => (typeof d === 'number' ? d : d.toNumber());
