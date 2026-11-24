// State tab dan grup tab. Semua fungsi murni: menerima workspace lama, mengembalikan yang baru.
// Ide arsitekturnya mengikuti TradingView Desktop (grup default + grup pengguna, pin,
// tab tersimpan saat ditutup), tetapi kodenya ditulis sendiri untuk web.

export const MAX_GROUPS = 10;
export const MAX_GROUP_NAME = 64;
const MAX_CLOSED = 10;

export const DEFAULT_INDICATORS = {
  volume: { on: true },
  sma: { on: true, period: 20 },
  ema: { on: false, period: 50 },
  rsi: { on: false, period: 14 },
};

const uid = () => crypto.randomUUID();
const clone = (o) => JSON.parse(JSON.stringify(o));

export function newTab(from = {}) {
  return {
    id: uid(),
    symbol: from.symbol || 'BTCUSDT',
    interval: from.interval || '1h',
    indicators: clone(from.indicators || DEFAULT_INDICATORS),
    pinned: false,
  };
}

function newGroup(name, tab = newTab()) {
  return { id: uid(), name, tabs: [tab], activeTabId: tab.id };
}

function readLegacy(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

// Workspace awal. Memakai pengaturan versi lama (satu chart) kalau ada.
export function initialWorkspace() {
  const tab = newTab({
    symbol: readLegacy('symbol'),
    interval: readLegacy('interval'),
    indicators: readLegacy('indicators'),
  });
  const g = newGroup('Utama', tab);
  return { groups: [g], activeGroupId: g.id, closed: [] };
}

export function isValidWorkspace(ws) {
  return !!ws && Array.isArray(ws.groups) && ws.groups.length > 0 &&
    ws.groups.every((g) => g && typeof g.id === 'string' && Array.isArray(g.tabs) && g.tabs.length > 0 &&
      g.tabs.every((t) => t && t.id && t.symbol && t.interval && t.indicators)) &&
    ws.groups.some((g) => g.id === ws.activeGroupId);
}

export const activeGroup = (ws) => ws.groups.find((g) => g.id === ws.activeGroupId);
export const activeTab = (ws) => {
  const g = activeGroup(ws);
  return g.tabs.find((t) => t.id === g.activeTabId) || g.tabs[0];
};

const mapActiveGroup = (ws, fn) => ({
  ...ws,
  groups: ws.groups.map((g) => (g.id === ws.activeGroupId ? fn(g) : g)),
});

// Tab yang di-pin selalu di depan, urutan lain dipertahankan.
const pinnedFirst = (tabs) => [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];

export function reduce(ws, a) {
  switch (a.type) {
    case 'activateTab':
      return mapActiveGroup(ws, (g) => (g.tabs.some((t) => t.id === a.id) ? { ...g, activeTabId: a.id } : g));

    case 'activateIndex':
      return mapActiveGroup(ws, (g) => (g.tabs[a.index] ? { ...g, activeTabId: g.tabs[a.index].id } : g));

    case 'addTab': {
      const tab = newTab(a.from || activeTab(ws));
      return mapActiveGroup(ws, (g) => ({ ...g, tabs: [...g.tabs, tab], activeTabId: tab.id }));
    }

    case 'updateTab':
      return mapActiveGroup(ws, (g) => ({ ...g, tabs: g.tabs.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) }));

    case 'closeTab': {
      const g = activeGroup(ws);
      const idx = g.tabs.findIndex((t) => t.id === a.id);
      if (idx < 0 || g.tabs[idx].pinned) return ws;
      const closedTab = g.tabs[idx];
      let tabs = g.tabs.filter((t) => t.id !== a.id);
      // Grup tidak boleh kosong: ganti dengan tab baru bersimbol sama.
      if (!tabs.length) tabs = [newTab(closedTab)];
      const activeTabId = g.activeTabId === a.id ? (tabs[idx] || tabs[idx - 1]).id : g.activeTabId;
      return {
        ...mapActiveGroup(ws, (x) => ({ ...x, tabs, activeTabId })),
        closed: [closedTab, ...(ws.closed || [])].slice(0, MAX_CLOSED),
      };
    }

    case 'reopenTab': {
      const [last, ...rest] = ws.closed || [];
      if (!last) return ws;
      const tab = { ...last, id: uid(), pinned: false };
      return { ...mapActiveGroup(ws, (g) => ({ ...g, tabs: [...g.tabs, tab], activeTabId: tab.id })), closed: rest };
    }

    case 'togglePin':
      return mapActiveGroup(ws, (g) => ({
        ...g,
        tabs: pinnedFirst(g.tabs.map((t) => (t.id === a.id ? { ...t, pinned: !t.pinned } : t))),
      }));

    case 'moveTab': {
      return mapActiveGroup(ws, (g) => {
        const from = g.tabs.findIndex((t) => t.id === a.id);
        if (from < 0) return g;
        const tabs = [...g.tabs];
        const [tab] = tabs.splice(from, 1);
        tabs.splice(Math.max(0, Math.min(a.toIndex, tabs.length)), 0, tab);
        return { ...g, tabs: pinnedFirst(tabs) };
      });
    }

    // Buka simbol: aktifkan tab yang sudah menampilkan simbol itu, atau buat tab baru.
    case 'openSymbol': {
      const g = activeGroup(ws);
      const existing = g.tabs.find((t) => t.symbol === a.symbol);
      if (existing) return reduce(ws, { type: 'activateTab', id: existing.id });
      return reduce(ws, { type: 'addTab', from: { ...activeTab(ws), symbol: a.symbol } });
    }

    case 'switchGroup':
      return ws.groups.some((g) => g.id === a.id) ? { ...ws, activeGroupId: a.id } : ws;

    case 'addGroup': {
      if (ws.groups.length >= MAX_GROUPS) return ws;
      const g = newGroup(a.name.slice(0, MAX_GROUP_NAME), newTab(activeTab(ws)));
      return { ...ws, groups: [...ws.groups, g], activeGroupId: g.id };
    }

    case 'renameGroup':
      return { ...ws, groups: ws.groups.map((g) => (g.id === a.id ? { ...g, name: a.name.slice(0, MAX_GROUP_NAME) } : g)) };

    case 'deleteGroup': {
      if (ws.groups.length <= 1) return ws;
      const groups = ws.groups.filter((g) => g.id !== a.id);
      return { ...ws, groups, activeGroupId: ws.activeGroupId === a.id ? groups[0].id : ws.activeGroupId };
    }

    default:
      return ws;
  }
}
