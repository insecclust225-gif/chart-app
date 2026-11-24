import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart, { formatPrice } from './components/Chart.jsx';
import Sidebar from './components/Sidebar.jsx';
import TabBar from './components/TabBar.jsx';
import Settings, { DEFAULT_ALERT_SETTINGS } from './components/Settings.jsx';
import { useToast } from './components/Toasts.jsx';
import { fetchTickers, subscribeTickers } from './lib/binance.js';
import { usePersistentState } from './lib/storage.js';
import { activeGroup, activeTab, initialWorkspace, isValidWorkspace, reduce } from './lib/workspace.js';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

let audioCtx = null;
function beep(volume) {
  try {
    audioCtx ||= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    osc.frequency.value = 880;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch { /* audio tidak tersedia */ }
}

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');

export default function App() {
  const toast = useToast();
  const [ws, setWs] = usePersistentState('workspace', initialWorkspace, isValidWorkspace);
  const [watchlist, setWatchlist] = usePersistentState('watchlist', DEFAULT_WATCHLIST);
  const [linesBySymbol, setLinesBySymbol] = usePersistentState('lines', {});
  const [alertLog, setAlertLog] = usePersistentState('alertLog', []);
  const [alertSettings, setAlertSettings] = usePersistentState('alertSettings', DEFAULT_ALERT_SETTINGS);
  const [drawMode, setDrawMode] = useState(false);
  const [tickers, setTickers] = useState({});

  const dispatch = useCallback((action) => setWs((w) => reduce(w, action)), [setWs]);
  const group = activeGroup(ws);
  const tab = activeTab(ws);
  const symbol = tab.symbol;
  const lines = linesBySymbol[symbol] || [];

  const updateTab = (patch) => dispatch({ type: 'updateTab', id: tab.id, patch });
  const setInd = (key, patch) => updateTab({ indicators: { ...tab.indicators, [key]: { ...tab.indicators[key], ...patch } } });

  const updateLines = useCallback((sym, fn) => {
    setLinesBySymbol((all) => ({ ...all, [sym]: fn(all[sym] || []) }));
  }, [setLinesBySymbol]);

  // ---------- Alert harga ----------
  const lastPrices = useRef({});
  const linesRef = useRef(linesBySymbol);
  const settingsRef = useRef(alertSettings);
  linesRef.current = linesBySymbol;
  settingsRef.current = alertSettings;

  const openSymbol = useCallback((sym) => {
    window.focus();
    dispatch({ type: 'openSymbol', symbol: sym });
  }, [dispatch]);

  const checkAlerts = useCallback((sym, price) => {
    if (price == null) return;
    const prev = lastPrices.current[sym];
    lastPrices.current[sym] = price;
    // Harga pertama setelah halaman dibuka tidak memicu alert (tidak ada pembanding).
    if (prev == null || prev === price) return;
    const hits = (linesRef.current[sym] || []).filter((l) =>
      l.alert && !l.triggered && ((prev < l.price && price >= l.price) || (prev > l.price && price <= l.price)));
    if (!hits.length) return;

    const ids = new Set(hits.map((h) => h.id));
    updateLines(sym, (ls) => ls.map((l) => (ids.has(l.id) ? { ...l, triggered: true } : l)));
    const s = settingsRef.current;
    if (s.sound && s.volume > 0) beep(s.volume);

    hits.forEach((h) => {
      const msg = `${sym} menyentuh ${formatPrice(h.price)} (harga ${formatPrice(price)})`;
      setAlertLog((log) => [{ id: h.id, time: Date.now(), symbol: sym, msg }, ...log].slice(0, 50));
      // key = id alert, jadi alert yang sama tidak pernah tampil dua kali.
      toast.show({ kind: 'alert', key: `alert:${h.id}`, message: `${msg}. Klik untuk membuka chart.`, onClick: () => openSymbol(sym) });
      if (s.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`Alert ${sym}`, { body: msg, tag: h.id });
        n.onclick = () => { openSymbol(sym); n.close(); };
      }
    });
  }, [updateLines, setAlertLog, toast, openSymbol]);

  // Simbol yang dipantau: watchlist + semua tab di grup aktif + simbol dengan alert aktif.
  const tickerKey = useMemo(() => {
    const set = new Set([...watchlist, ...group.tabs.map((t) => t.symbol)]);
    Object.entries(linesBySymbol).forEach(([s, ls]) => ls.some((l) => l.alert && !l.triggered) && set.add(s));
    return [...set].sort().join(',');
  }, [watchlist, group.tabs, linesBySymbol]);

  useEffect(() => {
    const syms = tickerKey ? tickerKey.split(',') : [];
    let active = true;
    fetchTickers(syms).then((t) => active && setTickers((old) => ({ ...old, ...t })));
    const close = subscribeTickers(syms, (s, t) => {
      setTickers((old) => ({ ...old, [s]: t }));
      checkAlerts(s, t.price);
    });
    return () => { active = false; close(); };
  }, [tickerKey, checkAlerts]);

  useEffect(() => {
    const p = tickers[symbol]?.price;
    document.title = p ? `${symbol} ${formatPrice(p)} · ${group.name}` : 'Chart App';
  }, [tickers, symbol, group.name]);

  // ---------- Shortcut keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || isTyping(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (k === 't' && e.shiftKey) dispatch({ type: 'reopenTab' });
      else if (k === 't') dispatch({ type: 'addTab' });
      else if (k === 'w') {
        if (tab.pinned) toast.show({ kind: 'info', key: 'pinned', message: 'Lepas pin dulu untuk menutup tab ini' });
        else dispatch({ type: 'closeTab', id: tab.id });
      } else if (/^[1-9]$/.test(e.key)) dispatch({ type: 'activateIndex', index: +e.key - 1 });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, tab.id, tab.pinned, toast]);

  const addLine = (price) => {
    updateLines(symbol, (ls) => [...ls, { id: crypto.randomUUID(), price: +price.toPrecision(8), alert: false }]);
    setDrawMode(false);
    toast.show({ kind: 'success', key: 'line', message: `Garis ditambahkan di ${formatPrice(price)}` });
  };

  return (
    <div className="app">
      <TabBar ws={ws} group={group} dispatch={dispatch} tickers={tickers} toast={toast} />

      <header className="toolbar">
        <span className="brand">Chart App</span>
        <div className="group">
          {INTERVALS.map((iv) => (
            <button key={iv} className={iv === tab.interval ? 'active' : ''} onClick={() => updateTab({ interval: iv })}>{iv}</button>
          ))}
        </div>
        <div className="group">
          <label><input type="checkbox" checked={tab.indicators.volume.on} onChange={(e) => setInd('volume', { on: e.target.checked })} /> Volume</label>
          {['sma', 'ema', 'rsi'].map((k) => (
            <label key={k}>
              <input type="checkbox" checked={tab.indicators[k].on} onChange={(e) => setInd(k, { on: e.target.checked })} /> {k.toUpperCase()}
              <input
                type="number" min="2" max="500" className="period" value={tab.indicators[k].period}
                onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 2 && v <= 500) setInd(k, { period: v }); }}
              />
            </label>
          ))}
        </div>
        <button className={drawMode ? 'active' : ''} onClick={() => setDrawMode((d) => !d)} title="Klik di chart untuk menaruh garis">
          ― Garis horizontal
        </button>
        <Settings settings={alertSettings} setSettings={setAlertSettings} onTestSound={() => beep(alertSettings.volume)} />
      </header>

      <main className="content">
        {/* Hanya tab aktif yang punya chart di memori; tab lain dibuat ulang saat dibuka. */}
        <Chart
          key={tab.id}
          symbol={symbol}
          interval={tab.interval}
          indicators={tab.indicators}
          lines={lines}
          drawMode={drawMode}
          onAddLine={addLine}
          onPrice={checkAlerts}
        />
        <Sidebar
          symbol={symbol}
          onSelect={(s) => updateTab({ symbol: s })}
          onOpenInNewTab={(s) => dispatch({ type: 'addTab', from: { ...tab, symbol: s } })}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          tickers={tickers}
          lines={lines}
          updateLines={(fn) => updateLines(symbol, fn)}
          alertLog={alertLog}
          clearLog={() => setAlertLog([])}
          onOpenAlert={openSymbol}
          toast={toast}
          requestNotify={() => alertSettings.desktop && 'Notification' in window && Notification.permission === 'default' && Notification.requestPermission()}
        />
      </main>
    </div>
  );
}
