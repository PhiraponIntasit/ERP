'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m); clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && <div key={msg} className="toast elev-md" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
