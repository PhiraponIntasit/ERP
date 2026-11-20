import { db } from '@/server/db';
import { audit, can, getUser } from '@/server/auth';
import { isPeriod, PERIODS, salesOrderRows, salesReport } from '@/server/sales';
import { ORDER_ST } from '@/server/orders';
import { DISPLAY_TZ } from '@/lib/domain';
import { toCsv } from '@/lib/csv';

/** CSV export of the sales report: `kind=orders` (one row per paid order, default) or `kind=products` (every product sold).
 *  Same period and figures as /sales. The export itself is audited. */
export async function GET(req: Request) {
  const me = await getUser();
  if (!me || !can(me, 'sales')) return new Response('Forbidden', { status: 403 });
  const u = new URL(req.url);
  const p = isPeriod(u.searchParams.get('p') ?? undefined) ? (u.searchParams.get('p') as (typeof PERIODS)[number][0]) : '30d';
  const kind = u.searchParams.get('kind') === 'products' ? 'products' : 'orders';
  const label = PERIODS.find(x => x[0] === p)![1];
  let rows: (string | number)[][];
  if (kind === 'orders') {
    const list = await salesOrderRows(p);
    rows = [['เลขที่คำสั่งซื้อ', 'วันเวลาที่ชำระ', 'สถานะ', 'ลูกค้า', 'อีเมล', 'จำนวนชิ้น', 'ยอดสินค้า', 'ส่วนลด', 'คูปอง', 'ค่าส่ง', 'ยอดรวม (รวม VAT)', 'ฐานภาษี', 'VAT 7%', 'ต้นทุนสินค้า', 'กำไรขั้นต้น'],
      ...list.map(o => [o.id, o.paidAt.toLocaleString('th-TH', { timeZone: DISPLAY_TZ }), ORDER_ST[o.status]?.[0] ?? o.status, o.customer, o.email, o.units,
        o.subtotal, o.discount, o.coupon, o.shipping, o.total, o.vatBase, o.vat, o.cost, o.profit])];
  } else {
    const r = await salesReport(p, 1000);
    rows = [['SKU', 'สินค้า', 'จำนวนที่ขาย', 'ยอดขาย (รวม VAT)', 'กำไรขั้นต้น'], ...r.top.map(t => [t.sku, t.name, t.qty, t.sales, t.profit])];
  }
  await audit(db, me, 'order', 'Export รายงานยอดขาย', 'CSV', `${kind === 'orders' ? 'รายคำสั่งซื้อ' : 'รายสินค้า'} · ${label} · ${rows.length - 1} รายการ`);
  const day = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ });
  return new Response(toCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sales-${kind}-${p}-${day}.csv"`, 'Cache-Control': 'no-store' } });
}
