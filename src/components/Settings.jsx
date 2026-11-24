import { useEffect, useRef, useState } from 'react';

export const DEFAULT_ALERT_SETTINGS = { sound: true, volume: 0.5, desktop: true };

export default function Settings({ settings, setSettings, onTestSound }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';

  return (
    <div className="settings" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} title="Pengaturan alert">Pengaturan alert</button>
      {open && (
        <div className="popover">
          <h3>Pengaturan alert</h3>
          <label><input type="checkbox" checked={settings.sound} onChange={(e) => set({ sound: e.target.checked })} /> Bunyi</label>
          <label className="row-label">
            Volume
            <input type="range" min="0" max="1" step="0.05" value={settings.volume} disabled={!settings.sound}
              onChange={(e) => set({ volume: +e.target.value })} />
            <button onClick={onTestSound} disabled={!settings.sound}>Tes</button>
          </label>
          <label>
            <input
              type="checkbox" checked={settings.desktop}
              onChange={(e) => {
                set({ desktop: e.target.checked });
                if (e.target.checked && permission === 'default') Notification.requestPermission();
              }}
            /> Notifikasi desktop (saat tab browser tidak dibuka)
          </label>
          {settings.desktop && permission === 'denied' && <p className="error">Notifikasi diblokir browser. Izinkan lewat ikon gembok di address bar.</p>}
          {permission === 'unsupported' && <p className="muted">Browser ini tidak mendukung notifikasi desktop.</p>}
          <p className="muted">Alert hanya dipantau selama halaman ini terbuka.</p>
        </div>
      )}
    </div>
  );
}
