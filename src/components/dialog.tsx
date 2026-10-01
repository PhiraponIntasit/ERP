'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Modal shell matching the design: fading backdrop, popping card, click-outside & Esc to close.
 *  Portalled to <body>: the page wrapper's entrance animation (a transform) would otherwise
 *  become the containing block and clip the fixed backdrop to the content column. */
export function Dialog({ title, onClose, className = '', children, bare = false }: { title?: React.ReactNode; onClose: () => void; className?: string; children: React.ReactNode; bare?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {bare ? children : (
        <div className={`dialog ${className}`} role="dialog" aria-modal="true">
          {title && <div className="dialog-title">{title}</div>}
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
}

export const Err = ({ msg }: { msg?: string }) => (msg ? <div className="err">{msg}</div> : null);
