import type { Prisma, PrismaClient } from '@prisma/client';

// Demo data for person A's storefront features (fictitious people):
// · มานี ใจดี (customer@example.com) has a delivered order and one on the way, both with serial-numbered parts,
//   so "คำสั่งซื้อของฉัน" and "แจ้งเคลม" can be shown live, plus two saved PC builds.
// · Three other customers' claims sit in the back office as submitted / received / rejected.
// Sold units get their own serials (…-SN9001), so stock on the shelf and the integrity checks are unchanged.

const DAY = 864e5;
const CHIANG_MAI = '99/1 ถนนนิมมานเหมินท์ ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200';
const BANGKOK = '12 ถนนสุขุมวิท ต.คลองเตย อ.คลองเตย จ.กรุงเทพมหานคร 10110';

type Sale = { customerId: string; skus: string[]; paidDaysAgo: number; status: 'shipped' | 'completed'; carrier: string; address: string };

async function sell(db: PrismaClient, s: Sale) {
  const now = Date.now();
  const c = await db.customer.findUniqueOrThrow({ where: { id: s.customerId } });
  const items = await db.inventoryItem.findMany({ where: { sku: { in: s.skus } } });
  const lines = s.skus.map(sku => { const i = items.find(x => x.sku === sku)!; return { sku, name: i.name, price: i.price, cost: i.cost, qty: 1 }; });
  const total = lines.reduce((a, l) => a + Number(l.price), 0); // ≥ 2,000 → free shipping
  const n = (await db.counter.update({ where: { key: 'ord' }, data: { value: { increment: 1 } } })).value - 1;
  const id = `ORD-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
  const paidAt = new Date(now - s.paidDaysAgo * DAY), shippedAt = new Date(paidAt.getTime() + DAY);
  await db.order.create({ data: {
    id, customerId: c.id, status: s.status, subtotal: total, discount: 0, shippingFee: 0, total,
    shipName: c.name, shipPhone: c.phone, shipAddress: s.address,
    createdAt: new Date(paidAt.getTime() - 5 * 60e3), expiresAt: new Date(paidAt.getTime() + 10 * 60e3), paidAt,
    shippedAt, completedAt: s.status === 'completed' ? new Date(paidAt.getTime() + 3 * DAY) : null,
    carrier: s.carrier, trackingNo: `TH${String(700000 + n)}`,
    lines: { create: lines },
    payments: { create: { provider: 'demo_promptpay', amount: total, status: 'successful', providerRef: `demo_seed_${n}`, expiresAt: new Date(paidAt.getTime() + 10 * 60e3), paidAt } },
  } });
  // Each serial-tracked unit leaves with its own serial (already off the shelf, so it is created as sold).
  const sold: Record<string, string> = {};
  for (const l of await db.orderLine.findMany({ where: { orderId: id }, include: { item: { select: { serialTracked: true } } } })) {
    if (!l.item.serialTracked) continue;
    const serial = `${l.sku}-SN${9001 + (await db.serialNumber.count({ where: { sku: l.sku, serial: { startsWith: `${l.sku}-SN9` } } }))}`;
    await db.serialNumber.create({ data: { serial, sku: l.sku, status: 'sold', receivedRef: 'ยอดตั้งต้น', orderLineId: l.id, createdAt: new Date(paidAt.getTime() - 30 * DAY) } });
    sold[l.sku] = serial;
  }
  await db.auditLog.create({ data: { t: shippedAt, userId: 'u6', by: 'วิภาดา รุ่งเรือง', role: 'Store Keeper', cat: 'order', action: 'จัดส่งสินค้า', target: id,
    detail: `${s.carrier} TH${700000 + n}${Object.values(sold).length ? ' · Serial ' + Object.values(sold).join(', ') : ''}` } });
  return { id, sold, customer: c };
}

type ClaimSeed = { sale: Awaited<ReturnType<typeof sell>>; sku: string; daysAgo: number; problem: string; status: 'submitted' | 'received' | 'rejected'; staffNote?: string };

async function claim(db: PrismaClient, k: ClaimSeed) {
  const at = new Date(Date.now() - k.daysAgo * DAY);
  const n = (await db.counter.update({ where: { key: 'clm' }, data: { value: { increment: 1 } } })).value - 1;
  const id = `CLM-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`, serial = k.sale.sold[k.sku], c = k.sale.customer;
  const received = k.status === 'submitted' ? null : new Date(at.getTime() + 2 * DAY);
  await db.claim.create({ data: {
    id, customerId: c.id, serial, orderId: k.sale.id, problem: k.problem, status: k.status, staffNote: k.staffNote ?? '',
    createdAt: at, receivedAt: received, closedAt: k.status === 'rejected' ? new Date(at.getTime() + 3 * DAY) : null,
  } });
  const log: Prisma.AuditLogCreateManyInput[] = [{ t: at, userId: null, by: `${c.name} (${c.email})`, role: 'ลูกค้า', cat: 'warranty', action: 'ลูกค้าแจ้งเคลม', target: serial, detail: `${id} · คำสั่งซื้อ ${k.sale.id} · ${k.problem}` }];
  if (received) log.push({ t: received, userId: 'u6', by: 'วิภาดา รุ่งเรือง', role: 'Store Keeper', cat: 'warranty', action: 'รับเครื่องเคลม', target: serial, detail: id });
  if (k.status === 'rejected') log.push({ t: new Date(at.getTime() + 3 * DAY), userId: 'u6', by: 'วิภาดา รุ่งเรือง', role: 'Store Keeper', cat: 'warranty', action: 'ไม่อนุมัติเคลม', target: serial, detail: `${id} · ${k.staffNote}` });
  await db.auditLog.createMany({ data: log });
}

export async function seedDemo(db: PrismaClient) {
  // มานี: a delivered AM5 set (claimable) and a graphics card still on its way (confirm receipt, then claim).
  await sell(db, { customerId: 'cus-demo', skus: ['CPU-R5-7600', 'MB-MSI-B650M', 'RAM-KF-32D5'], paidDaysAgo: 45, status: 'completed', carrier: 'Kerry Express', address: CHIANG_MAI });
  await sell(db, { customerId: 'cus-demo', skus: ['VGA-GB-4060'], paidDaysAgo: 2, status: 'shipped', carrier: 'Flash Express', address: CHIANG_MAI });

  // Back-office claim queue: one waiting for the unit, one being checked, one rejected.
  const a = await sell(db, { customerId: 'cus-1', skus: ['VGA-ASUS-4070S'], paidDaysAgo: 30, status: 'completed', carrier: 'Kerry Express', address: BANGKOK });
  const b = await sell(db, { customerId: 'cus-3', skus: ['CPU-I5-14400F', 'MB-GB-B760M'], paidDaysAgo: 60, status: 'completed', carrier: 'ไปรษณีย์ไทย (EMS)', address: BANGKOK });
  const c = await sell(db, { customerId: 'cus-2', skus: ['MB-TUF-B650'], paidDaysAgo: 90, status: 'completed', carrier: 'J&T Express', address: BANGKOK });
  await claim(db, { sale: a, sku: 'VGA-ASUS-4070S', daysAgo: 1, status: 'submitted', problem: 'เล่นเกมได้ประมาณ 10 นาทีแล้วจอดับ พัดลมการ์ดหมุนแรงมาก ลองถอดเสียบใหม่และเปลี่ยนสายไฟแล้ว' });
  await claim(db, { sale: b, sku: 'MB-GB-B760M', daysAgo: 4, status: 'received', problem: 'เปิดเครื่องไม่ติด ไฟ debug ที่บอร์ดค้างที่ DRAM ลองแรมอีกชุดแล้วยังเหมือนเดิม' });
  await claim(db, { sale: c, sku: 'MB-TUF-B650', daysAgo: 20, status: 'rejected', problem: 'ช่อง M.2 ช่องแรกไม่เจอ SSD',
    staffNote: 'ตรวจพบขาซ็อกเก็ต M.2 หักจากการติดตั้ง ไม่อยู่ในเงื่อนไขการรับประกัน ร้านซ่อมให้ได้โดยมีค่าใช้จ่าย' });

  // Saved PC builds (parts must exist in the seed catalogue).
  const builds: [string, Record<string, string>][] = [
    ['คอมเล่นเกม AM5', { cpu: 'CPU-R5-7600', mainboard: 'MB-MSI-B650M', ram: 'RAM-KF-32D5', vga: 'VGA-GB-4060', ssd: 'SSD-WD-SN850X', psu: 'PSU-CM-650B', case: 'CASE-CM-Q300L', cooler: 'COOL-DC-AK400' }],
    ['คอมตัดต่อวิดีโอ Intel', { cpu: 'CPU-I7-14700K', mainboard: 'MB-ASUS-Z790P', ram: 'RAM-GS-32D5', vga: 'VGA-ASUS-4070S', ssd: 'SSD-CR-P3P2T', psu: 'PSU-SS-GX850', case: 'CASE-MT-903', cooler: 'COOL-TR-PA120' }],
  ];
  for (const [name, parts] of builds) {
    await db.pcBuild.create({ data: { customerId: 'cus-demo', name, createdAt: new Date(Date.now() - 3 * DAY), items: { create: Object.entries(parts).map(([slot, sku]) => ({ slot, sku, qty: 1 })) } } });
  }
}
