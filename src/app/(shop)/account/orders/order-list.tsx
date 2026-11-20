import Link from 'next/link';
import type { MyOrder } from '@/server/my-orders';
import { baht, fmtDT } from '@/lib/domain';
import css from '../../storefront.module.css';

/** One card per order; the whole detail (items, payment QR, receipt, "received") is on /pay/[id]. */
export function OrderList({ orders }: { orders: MyOrder[] }) {
  return (
    <ul className={css.orders}>
      {orders.map(o => (
        <li key={o.id} className={`card ${css.order}`} data-order={o.id}>
          <div className={css.orderHead}>
            <span className="tnum" style={{ fontWeight: 600 }}>{o.id}</span>
            <span className={`tag ${o.statusTag}`}>{o.statusLabel}</span>
            <span className="muted tnum" style={{ fontSize: 13, marginLeft: 'auto' }}>{fmtDT(o.createdAt)}</span>
          </div>
          <div className={css.orderBody}>
            <span className={css.orderItems}>{o.summary}</span>
            <span className={`${css.orderTotal} tnum`}>{baht(o.total)}<span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · {o.count} ชิ้น</span></span>
          </div>
          {o.payBy && <span className={css.stockLow}>ชำระเงินภายใน {fmtDT(o.payBy)} — เลยเวลาแล้วระบบจะยกเลิกและคืนสต็อก</span>}
          {o.tracking && <span style={{ fontSize: 13 }}>เลขพัสดุ: <span className="tnum">{o.tracking}</span></span>}
          <div className={css.orderActions}>
            {o.payBy
              ? <Link href={`/pay/${o.id}`} className="btn btn-primary">ชำระเงิน</Link>
              : <Link href={`/pay/${o.id}`} className="btn btn-secondary">{o.status === 'shipped' ? 'ติดตามและยืนยันรับสินค้า' : 'ดูรายละเอียด'}</Link>}
          </div>
        </li>
      ))}
    </ul>
  );
}
