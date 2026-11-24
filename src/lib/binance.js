// Data pasar publik Binance (read-only, tanpa API key).
// Memakai mirror resmi data-api / data-stream.binance.vision.
const REST = 'https://data-api.binance.vision/api/v3';
const WS = 'wss://data-stream.binance.vision';

// Lightweight Charts menampilkan waktu dalam UTC; geser ke zona waktu lokal.
const toLocalTime = (ms) => Math.floor(ms / 1000) - new Date(ms).getTimezoneOffset() * 60;

const toBar = (t, o, h, l, c, v) => ({
  time: toLocalTime(t),
  open: +o,
  high: +h,
  low: +l,
  close: +c,
  volume: +v,
});

export async function fetchKlines(symbol, interval, limit = 1000) {
  const url = `${REST}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal memuat data ${symbol} (${res.status})`);
  const rows = await res.json();
  return rows.map((k) => toBar(k[0], k[1], k[2], k[3], k[4], k[5]));
}

export async function symbolExists(symbol) {
  // Respons error Binance tidak membawa header CORS, jadi fetch melempar error.
  try {
    const res = await fetch(`${REST}/exchangeInfo?symbol=${encodeURIComponent(symbol)}`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchTickers(symbols) {
  if (!symbols.length) return {};
  const res = await fetch(`${REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
  if (!res.ok) return {};
  const out = {};
  for (const t of await res.json()) {
    out[t.symbol] = { price: +t.lastPrice, change: +t.priceChangePercent };
  }
  return out;
}

// WebSocket dengan reconnect otomatis. Mengembalikan fungsi untuk menutup koneksi.
function openSocket(url, onMessage) {
  let ws;
  let closed = false;
  let retry = 0;
  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { retry = 0; };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (closed) return;
      setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  };
  connect();
  return () => { closed = true; ws?.close(); };
}

export function subscribeKlines(symbol, interval, onBar) {
  return openSocket(`${WS}/ws/${symbol.toLowerCase()}@kline_${interval}`, (d) => {
    const k = d.k;
    if (k) onBar(toBar(k.t, k.o, k.h, k.l, k.c, k.v));
  });
}

export function subscribeTickers(symbols, onTick) {
  if (!symbols.length) return () => {};
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join('/');
  return openSocket(`${WS}/stream?streams=${streams}`, ({ data }) => {
    if (!data) return;
    const price = +data.c;
    const open = +data.o;
    onTick(data.s, { price, change: open ? ((price - open) / open) * 100 : 0 });
  });
}
