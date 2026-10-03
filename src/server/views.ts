import 'server-only';
import type { Prisma } from '@prisma/client';
import { db, num } from './db';
import { ACTIVE_WORK, ASSIGNABLE } from './assignable';
import { CAT_LABEL, fmtD, fmtDT, PRST, slaOf, ST, STEP_IDX, STEPS, URG, VAT, baht, isPendingPR, canDecide, config } from '@/lib/domain';

export const ticketInclude = {
  requester: { select: { name: true, employee: { select: { dept: true } } } },
  assignee: { select: { name: true } },
  images: { orderBy: { ord: 'asc' } },
  parts: true,
  history: { orderBy: { t: 'desc' } },
} satisfies Prisma.TicketInclude;
type T = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function ticketView(t: T) {
  const si = STEP_IDX[t.status];
  return {
    id: t.id, title: t.title, desc: t.desc, status: t.status, urgency: t.urgency, assigneeId: t.assigneeId, requesterId: t.requesterId,
    catLabel: CAT_LABEL[t.cat] ?? t.cat, urgLabel: URG[t.urgency][0], urgTag: URG[t.urgency][1],
    statusLabel: ST[t.status][0], statusTag: ST[t.status][1], createdText: fmtDT(t.created),
    requester: t.requester.name, dept: t.requester.employee?.dept ?? '—', assetText: t.assetTag || '—',
    assigneeName: t.assignee?.name ?? 'ยังไม่มอบหมาย',
    imgs: t.images.map(i => ({ id: i.id, src: `/api/files/${i.id}`, name: i.name, kind: i.kind, eventId: i.eventId })),
    parts: t.parts.map(p => `${p.name} × ${p.qty}`),
    history: t.history.map(h => ({ id: h.id, tText: fmtDT(h.t), text: h.text, by: h.by })),
    steps: STEPS.map(([, label], i) => ({ label, done: i <= si, lineDone: i < si })),
    ...slaOf(t),
    rating: t.rating ?? 0, ratingText: t.rating ? '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating) : '',
    urgent: t.status === 'new' && (t.urgency === 'critical' || t.urgency === 'high'),
  };
}
export type TicketView = ReturnType<typeof ticketView>;

export const prInclude = {
  lines: { orderBy: { ord: 'asc' } }, requester: { select: { name: true } }, approver1: { select: { name: true } }, approver: { select: { name: true } },
} satisfies Prisma.PurchaseRequestInclude;
type P = Prisma.PurchaseRequestGetPayload<{ include: typeof prInclude }>;

export function prView(p: P, me: { id: string; role: string }, stock?: Map<string, { qty: number; min: number }>) {
  const total = p.lines.reduce((a, l) => a + l.qty * num(l.price), 0);
  const pending = isPendingPR(p.status);
  const c = pending ? canDecide(p, me) : { ok: false };
  const limit = config.approvalLimit();
  return {
    id: p.id, status: p.status, vendor: p.vendor, noteText: p.note || '—', reason: p.reason,
    dateText: fmtD(p.date), requesterName: p.requester.name, requesterId: p.requesterId,
    approverName: p.approver ? (p.approver1 && p.approver1Id !== p.approverId ? p.approver1.name + ' → ' : '') + p.approver.name : p.approver1 ? p.approver1.name + ' → …' : '—',
    approver1Name: p.approver1?.name ?? '', finalApprover: p.approver?.name ?? '—',
    approverSub: p.approver1 && p.approver1Id !== p.approverId ? 'ผู้อนุมัติขั้นสุดท้าย (ขั้นที่ 1: ' + p.approver1.name + ')' : 'ผู้อนุมัติ',
    decidedText: p.decided ? fmtD(p.decided) : '—',
    statusLabel: PRST[p.status][0], statusTag: PRST[p.status][1],
    total, totalText: baht(total), vatText: baht(total * VAT), grandText: baht(total * (1 + VAT)),
    itemsSummary: p.lines.map(l => `${l.name} × ${l.qty}`).join(', '),
    lineRows: p.lines.map((l, k) => ({ no: k + 1, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, priceText: baht(num(l.price)), amountText: baht(l.qty * num(l.price)), stockText: stock?.get(l.sku) ? `${stock.get(l.sku)!.qty} / ${stock.get(l.sku)!.min}` : '—' })),
    isPending: pending, hasL1: p.status === 'pending_exec', waitText: p.status === 'pending_exec' ? 'รอผู้บริหาร' : 'รอ Manager',
    isApproved: p.status === 'approved', isRejected: p.status === 'rejected', canPO: p.status === 'approved' || p.status === 'received',
    canDecide: pending && c.ok, blockText: pending && !c.ok ? c.why ?? '' : '',
    approveLabel: p.status === 'pending' && total * (1 + VAT) > limit ? 'อนุมัติขั้นที่ 1 → ส่งผู้บริหาร' : 'อนุมัติ',
  };
}
export type PRView = ReturnType<typeof prView>;

export async function techOptions() {
  const techs = await db.user.findMany({ where: ASSIGNABLE, orderBy: { id: 'asc' }, select: { id: true, name: true } });
  const loads = await db.ticket.groupBy({ by: ['assigneeId'], where: { status: { in: ACTIVE_WORK }, assigneeId: { in: techs.map(t => t.id) } }, _count: true });
  const load = new Map(loads.map(l => [l.assigneeId, l._count]));
  return techs.map(u => ({ id: u.id, name: u.name, load: load.get(u.id) ?? 0 }));
}
