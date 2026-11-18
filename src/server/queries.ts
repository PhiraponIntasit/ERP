import 'server-only';
import type { User } from '@prisma/client';
import { db } from './db';
import { can } from './auth';
import { STRANDED } from './assignable';
import { canDecide, OPEN, slaOf } from '@/lib/domain';
import { available } from './stock-reserve';

/** SKUs that already have a PR in flight (pending, pending_exec or approved) — never suggest re-ordering these. */
export async function openPrSkus() {
  const lines = await db.pRLine.findMany({ where: { pr: { status: { in: ['pending', 'pending_exec', 'approved'] } } }, select: { sku: true } });
  return new Set(lines.map(l => l.sku));
}

export async function lowStock() {
  const [items, open] = await Promise.all([db.inventoryItem.findMany({ orderBy: { sku: 'asc' } }), openPrSkus()]);
  // Units held for unpaid orders are as good as gone, so they don't count toward the reorder point
  const lowAll = items.filter(i => available(i) <= i.min);
  return { items, open, lowAll, lowNoPR: lowAll.filter(i => !open.has(i.sku)) };
}

/** Nav badges + bell notifications, computed only for modules the user can open. */
export async function shellData(me: User) {
  const isAdmin = me.role === 'admin';
  const badges: Record<string, number> = {};
  const notifs: { text: string; sub: string; href: string }[] = [];

  const [newCount, overdueN, strandedN, myAssigned, myOpenWork, low, pendingN, approvedMine, myResolved] = await Promise.all([
    can(me, 'dispatch') ? db.ticket.count({ where: { status: 'new' } }) : 0,
    can(me, 'dispatch') ? db.ticket.findMany({ where: { status: { in: OPEN } }, select: { created: true, urgency: true, status: true, resolvedAt: true } }).then(ts => ts.filter(t => slaOf(t).overdue).length) : 0,
    can(me, 'dispatch') ? db.ticket.count({ where: STRANDED }) : 0,
    can(me, 'tickets_work') ? db.ticket.count({ where: { assigneeId: me.id, status: 'assigned' } }) : 0,
    can(me, 'tickets_work') ? db.ticket.count({ where: { status: { in: OPEN }, ...(isAdmin ? { assigneeId: { not: null } } : { assigneeId: me.id }) } }) : 0,
    can(me, 'inventory') ? lowStock() : null,
    can(me, 'approvals') ? db.purchaseRequest.findMany({ where: { status: { in: ['pending', 'pending_exec'] } }, select: { requesterId: true, status: true, approver1Id: true } }).then(ps => ps.filter(p => canDecide(p, me).ok).length) : 0,
    can(me, 'purchase') ? db.purchaseRequest.count({ where: { status: 'approved', ...(isAdmin ? {} : { requesterId: me.id }) } }) : 0,
    can(me, 'my_tickets') ? db.ticket.count({ where: { requesterId: me.id, status: 'resolved' } }) : 0,
  ]);
  const [toPack, lateMoney] = can(me, 'orders') ? await Promise.all([
    db.order.count({ where: { status: 'paid' } }),
    db.order.count({ where: { status: { in: ['expired', 'cancelled'] }, payments: { some: { status: 'successful' } } } }),
  ]) : [0, 0];
  const lowNoPR = low?.lowNoPR ?? [];
  Object.assign(badges, { dispatch: newCount, tickets_work: myOpenWork, approvals: pendingN, inventory: lowNoPR.length, my_tickets: myResolved, purchase: approvedMine, orders: toPack + lateMoney });

  if (newCount) notifs.push({ text: `คำร้องใหม่รอมอบหมาย ${newCount} งาน`, sub: 'ศูนย์มอบหมายงาน', href: '/dispatch' });
  if (strandedN) notifs.push({ text: `งานค้างกับช่างที่รับงานไม่ได้แล้ว ${strandedN} งาน`, sub: 'บัญชีถูกระงับหรือถูกถอดสิทธิ์ — มอบหมายใหม่', href: '/dispatch' });
  if (overdueN) notifs.push({ text: `งานเกิน SLA ${overdueN} งาน`, sub: 'เร่งรัดผู้รับผิดชอบหรือมอบหมายใหม่', href: '/dispatch' });
  if (myAssigned) notifs.push({ text: `งานใหม่ที่ได้รับมอบหมาย ${myAssigned} งาน`, sub: 'งานที่ได้รับมอบหมาย', href: '/work' });
  if (lowNoPR.length) notifs.push({ text: `สินค้า ${lowNoPR.length} รายการต่ำกว่าจุดสั่งซื้อ`, sub: lowNoPR.map(i => i.name).join(', '), href: '/inventory' });
  if (pendingN) notifs.push({ text: `ใบขอซื้อรออนุมัติ ${pendingN} ใบ`, sub: 'อนุมัติการสั่งซื้อ', href: '/approvals' });
  if (approvedMine) notifs.push({ text: `ใบขอซื้อได้รับอนุมัติ ${approvedMine} ใบ`, sub: 'พร้อมออกใบสั่งซื้อ (PO) และรับเข้าคลัง', href: '/purchase' });
  if (toPack) notifs.push({ text: `คำสั่งซื้อชำระแล้ว รอแพ็ก ${toPack} รายการ`, sub: 'คำสั่งซื้อ & จัดส่ง', href: '/orders' });
  if (lateMoney) notifs.push({ text: `เงินเข้าหลังคำสั่งซื้อหมดเวลา ${lateMoney} รายการ`, sub: 'ต้องโอนคืนลูกค้า', href: '/orders?tab=refund' });
  if (myResolved) notifs.push({ text: `งานซ่อมเสร็จแล้ว รอคุณยืนยัน ${myResolved} งาน`, sub: 'คำร้องของฉัน', href: '/tickets/mine' });
  return { badges, notifs };
}
