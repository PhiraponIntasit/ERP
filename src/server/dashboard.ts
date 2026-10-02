import 'server-only';
import { Prisma } from '@prisma/client';
import { db, num } from './db';
import { OPEN, SLA_H, VAT } from '@/lib/domain';

/** Ticket and purchase figures for the dashboard, aggregated in the database so the page
 *  doesn't load every ticket and PR. Same rules as slaOf() / prView(). */
export async function dashboardStats(techIds: string[]) {
  const dueAt = Prisma.raw(`created + make_interval(hours => CASE urgency ${Object.entries(SLA_H).map(([k, h]) => `WHEN '${k}' THEN ${h}`).join(' ')} END)`);
  const [byStatus, byCat, criticalOpen, loads, ratings, [sla], prRows] = await Promise.all([
    db.ticket.groupBy({ by: ['status'], _count: true }),
    db.ticket.groupBy({ by: ['cat'], _count: true }),
    db.ticket.count({ where: { urgency: 'critical', status: { in: OPEN } } }),
    db.ticket.groupBy({ by: ['assigneeId'], where: { assigneeId: { in: techIds }, status: { in: OPEN.filter(s => s !== 'new') } }, _count: true }),
    db.ticket.groupBy({ by: ['assigneeId'], where: { assigneeId: { in: techIds }, rating: { gt: 0 } }, _avg: { rating: true } }),
    db.$queryRaw<{ met: bigint; overdue: bigint }[]>`
      SELECT count(*) FILTER (WHERE status IN ('resolved', 'closed') AND ("resolvedAt" IS NULL OR "resolvedAt" <= ${dueAt})) AS met,
             count(*) FILTER (WHERE status IN (${Prisma.join(OPEN)}) AND ${dueAt} < now()) AS overdue
      FROM "Ticket"`,
    db.$queryRaw<{ status: string; n: bigint; total: Prisma.Decimal | null }[]>`
      SELECT pr.status, count(DISTINCT pr.id) AS n, sum(l.qty * l.price) AS total
      FROM "PurchaseRequest" pr LEFT JOIN "PRLine" l ON l."prId" = pr.id GROUP BY pr.status`,
  ]);
  const st = new Map(byStatus.map(r => [r.status, r._count]));
  const pr = new Map(prRows.map(r => [r.status, { n: Number(r.n), grand: (r.total ? num(r.total) : 0) * (1 + VAT) }]));
  return {
    ticketsByStatus: (s: string) => st.get(s) ?? 0,
    ticketsTotal: byStatus.reduce((a, r) => a + r._count, 0),
    ticketsByCat: new Map(byCat.map(r => [r.cat, r._count])),
    criticalOpen,
    slaMet: Number(sla.met), overdue: Number(sla.overdue),
    techLoad: new Map(loads.map(r => [r.assigneeId, r._count])),
    techRating: new Map(ratings.map(r => [r.assigneeId, r._avg.rating ?? 0])),
    prCount: (s: string) => pr.get(s)?.n ?? 0,
    prGrand: (s: string) => pr.get(s)?.grand ?? 0,
  };
}
