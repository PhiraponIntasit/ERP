// Domain constants & pure helpers shared by server and client.

export const MODULES = [
  ['dashboard', 'แดชบอร์ดภาพรวม'], ['ticket_new', 'แจ้งปัญหา'], ['my_tickets', 'คำร้องของฉัน'],
  ['dispatch', 'ศูนย์มอบหมายงาน'], ['tickets_work', 'งานที่ได้รับมอบหมาย'], ['inventory', 'คลังสินค้า'],
  ['purchase', 'ใบขอซื้อ / ใบสั่งซื้อ'], ['approvals', 'อนุมัติการสั่งซื้อ'],
  ['employees', 'ข้อมูลพนักงาน & อุปกรณ์'], ['assets', 'ทะเบียนทรัพย์สิน'], ['users', 'บัญชีผู้ใช้ & สิทธิ์'], ['audit', 'Audit Log'],
] as const;
export type Module = (typeof MODULES)[number][0];
export const MOD_LABEL = Object.fromEntries(MODULES) as Record<Module, string>;
export const ALL: Module[] = MODULES.map(m => m[0]);
export const isModule = (m: string): m is Module => (ALL as string[]).includes(m);

export const MOD_PATH: Record<Module, string> = {
  dashboard: '/dashboard', ticket_new: '/tickets/new', my_tickets: '/tickets/mine', dispatch: '/dispatch',
  tickets_work: '/work', inventory: '/inventory', purchase: '/purchase', approvals: '/approvals',
  employees: '/employees', assets: '/assets', users: '/users', audit: '/audit',
};

export const HDR: Record<Module, [string, string]> = {
  dashboard: ['ภาพรวมระบบ', 'แดชบอร์ดผู้บริหาร'], ticket_new: ['Helpdesk', 'แจ้งปัญหา / ขอรับบริการ'],
  my_tickets: ['Helpdesk', 'คำร้องของฉัน'], dispatch: ['IT Management', 'ศูนย์มอบหมายงานซ่อม'],
  tickets_work: ['IT Support', 'งานที่ได้รับมอบหมาย'], inventory: ['Inventory', 'คลังสินค้า & สต็อก'],
  purchase: ['Procurement', 'ใบขอซื้อ & ใบสั่งซื้อ'], approvals: ['Procurement', 'อนุมัติการสั่งซื้อ'],
  employees: ['Directory', 'ข้อมูลพนักงาน & อุปกรณ์ที่ถือครอง'], users: ['Administration', 'บัญชีผู้ใช้ & สิทธิ์การเข้าถึง'],
  assets: ['Asset Registry', 'ทะเบียนทรัพย์สิน IT'], audit: ['Compliance', 'Audit Log · บันทึกการใช้งานระบบ'],
};

export const ROLES = [
  ['employee', 'Employee'], ['storekeeper', 'Store Keeper'], ['itsupport', 'IT Support'], ['itmanager', 'IT Manager'],
  ['manager', 'Manager'], ['executive', 'Executive'], ['admin', 'Admin'],
] as const;
export type Role = (typeof ROLES)[number][0];
export const ROLE_LABEL = Object.fromEntries(ROLES) as Record<Role, string>;
export const isRole = (r: string): r is Role => ROLES.some(x => x[0] === r);

export const ROLE_PERMS: Record<Role, Module[]> = {
  employee: ['ticket_new', 'my_tickets'],
  storekeeper: ['ticket_new', 'my_tickets', 'inventory', 'purchase'],
  itsupport: ['ticket_new', 'my_tickets', 'tickets_work', 'inventory', 'employees', 'assets'],
  itmanager: ['ticket_new', 'my_tickets', 'dispatch', 'assets'],
  manager: ['dashboard', 'ticket_new', 'my_tickets', 'approvals', 'audit'],
  executive: ['dashboard', 'ticket_new', 'my_tickets', 'approvals', 'audit'],
  admin: ALL,
};

export const SLA_H: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72 };
export const AUDIT_CATS: Record<string, string> = {
  auth: 'เข้าสู่ระบบ', user: 'ผู้ใช้ & สิทธิ์', ticket: 'งานซ่อม', stock: 'คลังสินค้า', purchase: 'จัดซื้อ',
  employee: 'พนักงาน', asset: 'ทรัพย์สิน', system: 'ระบบ',
};
export const EMP_F: Record<string, string> = { name: 'ชื่อ', position: 'ตำแหน่ง', dept: 'แผนก', email: 'อีเมล', phone: 'โทร' };

export const CATS = [
  ['laptop', 'โน้ตบุ๊ก / PC'], ['monitor', 'จอภาพ'], ['network', 'Network / Wi-Fi'],
  ['printer', 'เครื่องพิมพ์'], ['software', 'ซอฟต์แวร์ / สิทธิ์'], ['peripheral', 'อุปกรณ์ต่อพ่วง'],
] as const;
export const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS);

/** [label, tag class, sort weight] */
export const URG: Record<string, [string, string, number]> = {
  low: ['ต่ำ', 'tag-neutral', 0], medium: ['ปานกลาง', 'tag-accent-2', 1], high: ['สูง', 'tag-accent', 2], critical: ['วิกฤต', 'tag-outline', 3],
};
export const URG_KEYS = ['low', 'medium', 'high', 'critical'] as const;

export const ST: Record<string, [string, string]> = {
  new: ['รอมอบหมาย', 'tag-outline'], assigned: ['มอบหมายแล้ว', 'tag-accent'], progress: ['กำลังดำเนินการ', 'tag-accent'],
  waiting: ['รออะไหล่', 'tag-accent-2'], resolved: ['แก้ไขเสร็จ · รอยืนยัน', 'tag-neutral'], closed: ['ปิดงาน', 'tag-neutral'],
};
export const STEPS = [['new', 'แจ้งปัญหา'], ['assigned', 'มอบหมาย'], ['progress', 'ดำเนินการ'], ['resolved', 'แก้ไขเสร็จ'], ['closed', 'ปิดงาน']] as const;
export const STEP_IDX: Record<string, number> = { new: 0, assigned: 1, progress: 2, waiting: 2, resolved: 3, closed: 4 };
export const OPEN = ['new', 'assigned', 'progress', 'waiting'];
export const WORK_STATUSES = ['assigned', 'progress', 'waiting', 'resolved'] as const;

export const PRST: Record<string, [string, string]> = {
  pending: ['รอ Manager อนุมัติ', 'tag-outline'], pending_exec: ['รอผู้บริหารอนุมัติ', 'tag-outline'],
  approved: ['อนุมัติแล้ว', 'tag-accent'], rejected: ['ไม่อนุมัติ', 'tag-neutral'], received: ['รับเข้าคลังแล้ว', 'tag-neutral'],
};
export const isPendingPR = (status: string) => status === 'pending' || status === 'pending_exec';

export const ASSET_TYPES = ['Notebook', 'iPad / Tablet', 'Monitor', 'Mobile Phone', 'อื่น ๆ'];
export const DEPTS = ['IT', 'Operations', 'Marketing', 'Finance', 'HR'];
export const VAT = 0.07;

// ── formatting ───────────────────────────────────────────────────────────────
export const DISPLAY_TZ = process.env.DISPLAY_TZ || process.env.NEXT_PUBLIC_DISPLAY_TZ || 'Asia/Bangkok';
type D = Date | string | number;
const toDate = (d: D) => (d instanceof Date ? d : new Date(d));
export const fmt = (n: number) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
export const baht = (n: number) => '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const bahtS = (n: number) => '฿' + Math.round(n).toLocaleString('th-TH');
export const fmtDT = (d: D) => toDate(d).toLocaleString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtD = (d: D) => toDate(d).toLocaleDateString('th-TH', { timeZone: DISPLAY_TZ, day: 'numeric', month: 'short', year: 'numeric' });
/** Calendar day key (YYYY-MM-DD) in the display time zone */
export const dayKey = (d: D) => toDate(d).toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ });

// ── SLA ──────────────────────────────────────────────────────────────────────
export type Sla = { slaText: string; slaTag: string; slaMet?: boolean; overdue: boolean };
export function slaOf(t: { created: Date; urgency: string; status: string; resolvedAt: Date | null }, nowMs = Date.now()): Sla {
  const due = t.created.getTime() + SLA_H[t.urgency] * 36e5;
  const done = t.status === 'resolved' || t.status === 'closed';
  const dur = (ms: number) => { const hh = Math.abs(ms) / 36e5; return hh < 1 ? Math.max(1, Math.round(hh * 60)) + ' นาที' : hh < 48 ? Math.round(hh) + ' ชม.' : Math.round(hh / 24) + ' วัน'; };
  if (done) { const met = !t.resolvedAt || t.resolvedAt.getTime() <= due; return { slaText: met ? 'ทัน SLA' : 'เกิน SLA', slaTag: 'tag-neutral', slaMet: met, overdue: false }; }
  const left = due - nowMs;
  return left < 0
    ? { slaText: 'เกิน SLA ' + dur(left), slaTag: 'tag-outline', overdue: true }
    : { slaText: 'SLA เหลือ ' + dur(left), slaTag: left < 2 * 36e5 ? 'tag-accent' : 'tag-neutral', overdue: false };
}

/** Sort: open first, then urgency, then newest */
export function sortTickets<T extends { status: string; urgency: string; created: Date }>(arr: T[]): T[] {
  return [...arr].sort((a, b) =>
    (Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status))) ||
    (URG[b.urgency][2] - URG[a.urgency][2]) ||
    (b.created.getTime() - a.created.getTime()));
}

export const config = {
  approvalLimit: () => Number(process.env.APPROVAL_LIMIT ?? 50000) || 50000,
  reorderFactor: () => Math.min(6, Math.max(1, Number(process.env.REORDER_FACTOR ?? 3) || 3)),
  defaultTheme: (): 'light' | 'dark' => (process.env.DEFAULT_THEME === 'dark' ? 'dark' : 'light'),
  showDemo: () => (process.env.SHOW_DEMO_ACCOUNTS ?? 'false').toLowerCase() === 'true',
};

// ── purchase approval rules (segregation of duties) ─────────────────────────
export function canDecide(p: { requesterId: string; status: string; approver1Id: string | null }, me: { id: string; role: string }): { ok: boolean; why?: string } {
  if (p.requesterId === me.id) return { ok: false, why: 'คุณเป็นผู้ขอซื้อใบนี้ — ต้องให้ผู้อื่นอนุมัติ (แบ่งแยกหน้าที่)' };
  if (p.status === 'pending' && !['manager', 'admin'].includes(me.role)) return { ok: false, why: 'รอ Manager อนุมัติขั้นที่ 1' };
  if (p.status === 'pending_exec') {
    if (!['executive', 'admin'].includes(me.role)) return { ok: false, why: 'ยอดเกินวงเงิน — รอผู้บริหารอนุมัติขั้นสุดท้าย' };
    if (p.approver1Id === me.id) return { ok: false, why: 'คุณอนุมัติขั้นที่ 1 แล้ว — ขั้นสุดท้ายต้องเป็นผู้บริหารคนอื่น' };
  }
  return { ok: true };
}
/** Roles that see every PR on the purchase page (others see only their own) */
export const PR_SEE_ALL = ['admin', 'manager', 'executive'];
