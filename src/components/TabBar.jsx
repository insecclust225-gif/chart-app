import { useState } from 'react';
import { MAX_GROUPS } from '../lib/workspace.js';
import { formatPrice } from './Chart.jsx';

export default function TabBar({ ws, group, dispatch, tickers, toast }) {
  const [dragId, setDragId] = useState(null);

  const addGroup = () => {
    if (ws.groups.length >= MAX_GROUPS) return toast.show({ kind: 'error', message: `Maksimal ${MAX_GROUPS} grup tab` });
    const name = window.prompt('Nama grup baru:', `Grup ${ws.groups.length + 1}`);
    if (name?.trim()) dispatch({ type: 'addGroup', name: name.trim() });
  };

  const renameGroup = () => {
    const name = window.prompt('Ganti nama grup:', group.name);
    if (name?.trim()) dispatch({ type: 'renameGroup', id: group.id, name: name.trim() });
  };

  const deleteGroup = () => {
    if (ws.groups.length <= 1) return toast.show({ kind: 'info', message: 'Grup terakhir tidak bisa dihapus' });
    if (window.confirm(`Hapus grup "${group.name}" beserta ${group.tabs.length} tab di dalamnya?`)) {
      dispatch({ type: 'deleteGroup', id: group.id });
    }
  };

  const close = (t) => {
    if (t.pinned) return toast.show({ kind: 'info', key: 'pinned', message: 'Lepas pin dulu untuk menutup tab ini' });
    dispatch({ type: 'closeTab', id: t.id });
  };

  return (
    <div className="tabbar">
      <div className="group-picker">
        <select value={group.id} onChange={(e) => dispatch({ type: 'switchGroup', id: e.target.value })} title="Grup tab">
          {ws.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.tabs.length})</option>)}
        </select>
        <button className="icon" title="Grup baru" onClick={addGroup}>+ Grup</button>
        <button className="icon" title="Ganti nama grup" onClick={renameGroup}>Ubah</button>
        <button className="icon" title="Hapus grup" onClick={deleteGroup}>Hapus</button>
      </div>

      <div className="tabs" role="tablist">
        {group.tabs.map((t, i) => {
          const tk = tickers[t.symbol];
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === group.activeTabId}
              className={`tab ${t.id === group.activeTabId ? 'active' : ''} ${t.pinned ? 'pinned' : ''} ${dragId === t.id ? 'dragging' : ''}`}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) dispatch({ type: 'moveTab', id: dragId, toIndex: i }); setDragId(null); }}
              onClick={() => dispatch({ type: 'activateTab', id: t.id })}
              onAuxClick={(e) => e.button === 1 && close(t)}
              onDoubleClick={() => dispatch({ type: 'togglePin', id: t.id })}
              title={`${t.symbol} ${t.interval}${i < 9 ? ` · Alt+${i + 1}` : ''}\nKlik ganda untuk ${t.pinned ? 'lepas pin' : 'pin'}`}
            >
                            <span className="tab-symbol">{t.symbol}</span>
              {!t.pinned && <span className="muted">{t.interval}</span>}
              {tk && !t.pinned && <span className={tk.change >= 0 ? 'up' : 'down'}>{formatPrice(tk.price)}</span>}
              {!t.pinned && (
                <button className="icon tab-close" aria-label="Tutup tab" onClick={(e) => { e.stopPropagation(); close(t); }}>×</button>
              )}
            </div>
          );
        })}
        <button className="icon new-tab" title="Tab baru (Alt+T)" onClick={() => dispatch({ type: 'addTab' })}>+</button>
      </div>

      {ws.closed?.length > 0 && (
        <button className="link reopen" title="Buka lagi tab yang terakhir ditutup (Alt+Shift+T)" onClick={() => dispatch({ type: 'reopenTab' })}>
          Buka lagi {ws.closed[0].symbol}
        </button>
      )}
    </div>
  );
}
