import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Aturan per jenis toast. autoHideMs null = toast tetap tampil sampai diklik / ditutup.
export const TOAST_PRESETS = {
  info: { autoHideMs: 2500 },
  success: { autoHideMs: 2500 },
  error: { autoHideMs: 4000 },
  alert: { autoHideMs: null, label: 'ALERT' },
};
const MAX_VISIBLE = 5;

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const clearTimer = (id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  };

  const hide = useCallback((id) => {
    clearTimer(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  // Toast dengan key yang sama menggantikan toast lama dan timernya diulang dari awal.
  const show = useCallback(({ kind = 'info', message, key, onClick }) => {
    const id = key || crypto.randomUUID();
    clearTimer(id);
    setToasts((ts) => [...ts.filter((t) => t.id !== id), { id, kind, message, onClick }].slice(-MAX_VISIBLE));
    const ms = TOAST_PRESETS[kind]?.autoHideMs;
    if (ms) timers.current.set(id, setTimeout(() => hide(id), ms));
    return id;
  }, [hide]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind} ${t.onClick ? 'clickable' : ''}`}
            onClick={() => { t.onClick?.(); hide(t.id); }}
          >
            {TOAST_PRESETS[t.kind]?.label && <span className="toast-label">{TOAST_PRESETS[t.kind].label}</span>}
            <span className="toast-msg">{t.message}</span>
            <button className="icon" aria-label="Tutup" onClick={(e) => { e.stopPropagation(); hide(t.id); }}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
