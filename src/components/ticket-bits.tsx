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

export function Thumbs({ t }: { t: TicketView }) {
  if (!t.imgs.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {t.imgs.map(im => (
        <a key={im.id} href={im.src} target="_blank" rel="noreferrer" title={im.name}>
          <div className="plate plate-img thumb" style={{ backgroundImage: `url(${im.src})` }} />
        </a>
      ))}
    </div>
  );
}

export function History({ t }: { t: TicketView }) {
  return (
    <details style={{ fontSize: 13 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--color-accent-700)' }}>ประวัติการดำเนินงาน ({t.history.length})</summary>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {t.history.map((h, i) => (
          <div key={i} className="hist-row"><span className="muted tnum">{h.tText}</span><span>{h.text} — {h.by}</span></div>
        ))}
      </div>
    </details>
  );
}
