import 'server-only';
import { db } from './db';
import { fmtD, fmtDT, ST } from '@/lib/domain';

/** Asset registry rows incl. warranty status, repair history (tickets citing the tag) and custody history. */
export async function assetRows() {
  const [assets, tickets] = await Promise.all([
    db.asset.findMany({ orderBy: { tag: 'asc' }, include: { holder: true, history: { orderBy: { t: 'desc' } } } }),
    db.ticket.findMany({ where: { assetTag: { not: '' } }, select: { id: true, title: true, created: true, status: true, assetTag: true }, orderBy: { created: 'desc' } }),
  ]);
  const now = Date.now();
  return assets.map(a => {
    const dd = a.warrantyEnd ? (a.warrantyEnd.getTime() - now) / 864e5 : null;
    const rs = tickets.filter(t => t.assetTag.toUpperCase() === a.tag);
    return {
      tag: a.tag, type: a.type, model: a.model, serialText: a.serial || '—',
      holderId: a.holderId, holderName: a.holder?.name ?? 'ว่าง · คลัง IT', holderDept: a.holder?.dept ?? '',
      warrantyText: a.warrantyEnd ? fmtD(a.warrantyEnd) : '—',
      warn: dd !== null && dd < 90, expired: dd !== null && dd < 0, warnLabel: dd !== null && dd < 0 ? 'หมดประกัน' : 'ใกล้หมดประกัน',
      repairCount: rs.length,
      tickets: rs.map(t => ({ id: t.id, title: t.title, dText: fmtD(t.created), statusLabel: ST[t.status][0], statusTag: ST[t.status][1] })),
      hist: a.history.map(x => ({ tText: fmtDT(x.t), text: x.text, by: x.by })),
    };
  });
}
export type AssetRow = Awaited<ReturnType<typeof assetRows>>[number];
