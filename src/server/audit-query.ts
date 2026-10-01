import 'server-only';
import type { Prisma } from '@prisma/client';
import { AUDIT_CATS } from '@/lib/domain';

export function auditWhere(cat: string, q: string): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (cat && cat !== 'all' && AUDIT_CATS[cat]) where.cat = cat;
  const s = q.trim();
  if (s) where.OR = (['by', 'action', 'target', 'detail'] as const).map(f => ({ [f]: { contains: s, mode: 'insensitive' } }));
  return where;
}
