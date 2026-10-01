'use client';
import { useState } from 'react';
import { MoonIcon, SunIcon } from './icons';

export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [theme, setTheme] = useState(initial);
  const isDark = theme === 'dark';
  const toggle = () => {
    const t = isDark ? 'light' : 'dark';
    document.cookie = `erp_theme=${t}; path=/; max-age=31536000; samesite=lax`;
    const apply = () => document.documentElement.setAttribute('data-theme', t);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !reduce) d.startViewTransition(apply); else apply();
    setTheme(t);
  };
  return (
    <button type="button" className="btn btn-secondary btn-icon" onClick={toggle} title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'} aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
