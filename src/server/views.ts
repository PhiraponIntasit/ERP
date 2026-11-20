import 'server-only';
import type { Prisma } from '@prisma/client';
import { num } from './db';
import { fmtD, PRST, VAT, baht, isPendingPR, canDecide, config } from '@/lib/domain';

export const prInclude = {
  lines: { orderBy: { ord: 'asc' } }, requester: { select: { name: true } }, supplier: { select: { taxId: true, phone: true, email: true } }, approver1: { select: { name: true } }, approver: { select: { name: true } },
} satisfies Prisma.PurchaseRequestInclude;
type P = Prisma.PurchaseRequestGetPayload<{ include: typeof prInclude }>;

export function prView(p: P, me: { id: string; role: string }, stock?: Map<string, { qty: number; min: number }>) {
  const total = p.lines.reduce((a, l) => a + l.qty * num(l.price), 0);
  const pending = isPendingPR(p.status);
  const c = pending ? canDecide(p, me) : { ok: false };
  const limit = config.approvalLimit();
  return {
    id: p.id, status: p.status, vendor: p.vendor, vendorTax: p.supplier?.taxId ?? '', vendorContact: [p.supplier?.phone, p.supplier?.email].filter(Boolean).join(' · '), noteText: p.note || '—', reason: p.reason,
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

