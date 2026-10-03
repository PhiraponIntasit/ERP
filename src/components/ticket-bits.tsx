import type { TicketView } from '@/server/views';
import css from './ticket-bits.module.css';

export function TicketHead({ t, order = 'status-first' }: { t: TicketView; order?: 'status-first' | 'urg-first' }) {
  return (
    <div className="tcard-head">
      <span className="num tid">#{t.id}</span>
      {order === 'status-first' ? (<>
        <span className={`tag ${t.statusTag}`}>{t.statusLabel}</span>
        <span className={`tag ${t.urgTag}`}>เร่งด่วน: {t.urgLabel}</span>
        <span className={`tag ${t.slaTag}`}>{t.slaText}</span>
      </>) : (<>
        <span className={`tag ${t.urgTag}`}>เร่งด่วน: {t.urgLabel}</span>
        <span className={`tag ${t.slaTag}`}>{t.slaText}</span>
        <span className={`tag ${t.statusTag}`}>{t.statusLabel}</span>
      </>)}
      <span className="card-meta" style={{ marginLeft: 'auto' }}>{t.createdText}</span>
    </div>
  );
}

export function TicketBody({ t, titleSize = 21 }: { t: TicketView; titleSize?: number }) {
  return (<>
    <div className="card-title" style={{ fontSize: titleSize }}>{t.title}</div>
    <p className={`card-body ${css.desc}`}>{t.desc}</p>
  </>);
}

export function Steps({ t }: { t: TicketView }) {
  return (
    <div className="steps">
      {t.steps.map(s => (
        <div key={s.label} className={`step${s.done ? ' done' : ''}${s.lineDone ? ' line-done' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center' }}><span className="step-dot" /><span className="step-line" /></div>
          <span className="step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

type Im = TicketView['imgs'][number];
const Pics = ({ imgs, small = false }: { imgs: Im[]; small?: boolean }) => (
  <div className={css.pics}>
    {imgs.map(im => (
      <a key={im.id} href={im.src} target="_blank" rel="noreferrer" title={im.name}>
        <div className={`plate plate-img thumb${small ? ' ' + css.small : ''}`} style={{ backgroundImage: `url(${im.src})` }} />
      </a>
    ))}
  </div>
);

/** The requester's photos, then the technician's (before / after the repair) under their own label. */
export function Thumbs({ t }: { t: TicketView }) {
  const report = t.imgs.filter(i => i.kind !== 'work'), work = t.imgs.filter(i => i.kind === 'work');
  if (!t.imgs.length) return null;
  return (<>
    {report.length > 0 && <Pics imgs={report} />}
    {work.length > 0 && (
      <div className={css.workPics} role="group" aria-label="รูปจากช่าง">
        <span className={css.picsLabel}>รูปจากช่าง ({work.length})</span>
        <Pics imgs={work} />
      </div>
    )}
  </>);
}

export function History({ t }: { t: TicketView }) {
  return (
    <details style={{ fontSize: 13 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--color-accent-700)' }}>ประวัติการดำเนินงาน ({t.history.length})</summary>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {t.history.map((h, i) => (
          <div key={i} className="hist-row"><span className="muted tnum">{h.tText}</span><span>{h.text} — {h.by}
            {t.imgs.some(im => im.eventId === h.id) && <Pics imgs={t.imgs.filter(im => im.eventId === h.id)} small />}</span></div>
        ))}
      </div>
    </details>
  );
}
