import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';

/** Neon's pooled connection (host "…-pooler…") runs through PgBouncer, where Prisma needs `pgbouncer=true`
 *  and a small `connection_limit` per serverless instance. Vercel's Neon integration owns DATABASE_URL
 *  (it can't be edited there), so the flags are added here when they're missing. */
export function datasourceUrl(raw = process.env.DATABASE_URL): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('-pooler')) return raw;
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '5');
    return u.toString();
  } catch {
    return raw;
  }
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });
if (process.env.NODE_ENV !== 'production') g.prisma = db;

export type Tx = Prisma.TransactionClient;

/** Atomically take the next value of a document sequence. */
export async function nextSeq(tx: Tx, key: string): Promise<number> {
  const c = await tx.counter.update({ where: { key }, data: { value: { increment: 1 } } });
  return c.value - 1;
}

export const num = (d: Prisma.Decimal | number) => (typeof d === 'number' ? d : d.toNumber());
