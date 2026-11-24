import { useState } from 'react';
import { symbolExists } from '../lib/binance.js';
import { formatPrice } from './Chart.jsx';

export default function Sidebar({
  symbol, onSelect, onOpenInNewTab, watchlist, setWatchlist, tickers, lines, updateLines,
  alertLog, clearLog, onOpenAlert, toast, requestNotify,
}) {
  const [input, setInput] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [checking, setChecking] = useState(false);

  const addSymbol = async (e) => {
    e.preventDefault();
    const s = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return;
    if (watchlist.includes(s)) { onSelect(s); setInput(''); return; }
    setChecking(true);
    const ok = await symbolExists(s);
    setChecking(false);
    if (!ok) { toast.show({ kind: 'error', key: 'symbol', message: `Simbol ${s} tidak ditemukan di Binance` }); return; }
    setWatchlist((w) => [...w, s]);
    onSelect(s);
    setInput('');
    toast.show({ kind: 'success', key: 'symbol', message: `${s} ditambahkan ke watchlist` });
  };

  const addManualAlert = (e) => {
    e.preventDefault();
    const p = parseFloat(manualPrice);
    if (!(p > 0)) return;
    updateLines((ls) => [...ls, { id: crypto.randomUUID(), price: p, alert: true }]);
    requestNotify();
    setManualPrice('');
    toast.show({ kind: 'success', key: 'line', message: `Alert ${symbol} di ${formatPrice(p)} aktif` });
  };

  return (
    <aside className="sidebar">
      <section>
        <h3>Watchlist</h3>
        <form onSubmit={addSymbol} className="row">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tambah simbol, mis. ADAUSDT" />
          <button type="submit" disabled={checking}>{checking ? '…' : '+'}</button>
        </form>
        <table className="list">
          <tbody>
            {watchlist.map((s) => {
              const t = tickers[s];
              return (
                <tr key={s} className={s === symbol ? 'selected' : ''} onClick={() => onSelect(s)} title="Klik: ganti simbol di tab ini. Klik tengah: buka di tab baru."
                  onAuxClick={(e) => e.button === 1 && onOpenInNewTab(s)}>
                  <td>{s}</td>
                  <td className="num">{t ? formatPrice(t.price) : '…'}</td>
                  <td className={`num ${t && t.change >= 0 ? 'up' : 'down'}`}>{t ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%` : ''}</td>
                  <td className="actions">
                    <button className="icon" title="Buka di tab baru" onClick={(e) => { e.stopPropagation(); onOpenInNewTab(s); }}>+tab</button>
                    <button className="icon danger" title="Hapus" onClick={(e) => { e.stopPropagation(); setWatchlist((w) => w.filter((x) => x !== s)); }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Garis & alert {symbol}</h3>
        <form onSubmit={addManualAlert} className="row">
          <input type="number" step="any" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Harga alert" />
          <button type="submit">+ Alert</button>
        </form>
        {lines.length === 0 && <p className="muted">Belum ada garis. Pakai tombol "Garis horizontal" lalu klik di chart, atau isi harga di atas.</p>}
        <table className="list">
          <tbody>
            {[...lines].sort((a, b) => b.price - a.price).map((l) => (
              <tr key={l.id}>
                <td className="num">{formatPrice(l.price)}</td>
                <td>
                  <label title="Aktifkan alert saat harga menyentuh garis ini">
                    <input
                      type="checkbox" checked={l.alert}
                      onChange={(e) => {
                        if (e.target.checked) requestNotify();
                        updateLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, alert: e.target.checked, triggered: false } : x)));
                      }}
                    /> alert
                  </label>
                  {l.triggered && <span className="muted"> ✓ terpicu</span>}
                </td>
                <td className="actions">
                  <button className="icon danger" title="Hapus" onClick={() => updateLines((ls) => ls.filter((x) => x.id !== l.id))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Riwayat alert {alertLog.length > 0 && <button className="link" onClick={clearLog}>hapus</button>}</h3>
        {alertLog.length === 0 && <p className="muted">Belum ada alert terpicu.</p>}
        <ul className="log">
          {alertLog.map((a, i) => (
            <li key={a.id || i} className={a.symbol ? 'clickable' : ''} onClick={() => a.symbol && onOpenAlert(a.symbol)}>
              <span className="muted">{new Date(a.time).toLocaleString()}</span><br />{a.msg}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
