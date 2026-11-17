import Link from 'next/link';
import { db } from '@/server/db';
import { requirePage } from '@/server/auth';
import { lookupSerial } from '@/server/warranty';
import { WarrantyActions, SerialSearch } from './view';

const ST: Record<string, [string, string]> = { in_stock: ['อยู่ในสต็อก', 'tag-neutral'], sold: ['ขายแล้ว', 'tag-accent'], claim: ['รับเคลม · รอส่งคืนผู้ขาย', 'tag-accent-2'], returned: ['ส่งคืนผู้ขายแล้ว', 'tag-outline'] };

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePage('warranty');
  const q = ((await searchParams).q ?? '').trim().slice(0, 64);
  const [info, pending] = await Promise.all([
    q ? lookupSerial(q) : null,
    db.serialNumber.findMany({ where: { status: 'claim' }, orderBy: { serial: 'asc' }, include: { item: { select: { name: true } } } }),
  ]);
  return (
    <div className="anim-page stack-4">
      <p className="lead" style={{ maxWidth: '80ch' }}>สแกน Serial จากตัวสินค้าที่ลูกค้านำมาเคลม ระบบบอกว่าขายให้ใคร คำสั่งซื้อไหน และประกันเหลือถึงเมื่อไร (นับจากวันจัดส่ง) ถ้าอยู่ในประกัน เปลี่ยนเครื่องใหม่จากสต็อกได้ทันที เครื่องเดิมจะรอส่งคืนผู้ขาย</p>
      <SerialSearch q={q} />
      {q && !info && <div className="empty" role="status">ไม่พบ Serial {q}</div>}
      {info && (
        <section className="card stack-4" aria-label={`Serial ${info.serial}`}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 className="section-h tnum" style={{ margin: 0 }}>{info.serial}</h3>
            <span className={`tag ${ST[info.status]?.[1] ?? 'tag-neutral'}`} data-testid="serial-status">{ST[info.status]?.[0] ?? info.status}</span>
            {info.status === 'sold' && <span className={`tag ${info.inWarranty ? 'tag-accent' : 'tag-outline'}`} data-testid="warranty">{info.inWarranty ? `อยู่ในประกันถึง ${info.untilText}` : `หมดประกัน ${info.untilText}`}</span>}
          </div>
          <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 14 }}>
            <span className="muted">สินค้า</span><span>{info.name} ({info.sku}) · ประกัน {info.warrantyMonths} เดือน</span>
            <span className="muted">รับเข้าจาก</span><span>{info.receivedRef}</span>
            {info.orderId && <><span className="muted">คำสั่งซื้อ</span><span><Link href={`/orders/${info.orderId}`}>{info.orderId}</Link> · จัดส่ง {info.soldText}</span></>}
            {info.customer && <><span className="muted">ลูกค้า</span><span>{info.customer.name} · {info.customer.phone} · {info.customer.email}</span></>}
          </div>
          <WarrantyActions info={info} />
          {info.history.length > 0 && <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {info.history.map(h => <li key={h.id}><span className="muted tnum">{h.tText}</span> · {h.action} <span className="muted">โดย {h.by}</span><div className="muted">{h.detail}</div></li>)}
          </ol>}
        </section>
      )}
      <section className="stack-4" aria-label="เครื่องเสียรอส่งคืนผู้ขาย">
        <h3 className="section-h">เครื่องเสียรอส่งคืนผู้ขาย ({pending.length})</h3>
        {pending.length ? <div className="scroll-x"><table className="table">
          <thead><tr><th>Serial</th><th>สินค้า</th></tr></thead>
          <tbody>{pending.map(s => <tr key={s.serial}><td className="tnum"><Link href={`/warranty?q=${encodeURIComponent(s.serial)}`}>{s.serial}</Link></td><td>{s.item.name}</td></tr>)}</tbody>
        </table></div> : <div className="empty">ไม่มี</div>}
      </section>
    </div>
  );
}
