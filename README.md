# Chart App

Aplikasi chart crypto pribadi (React + Vite + Lightweight Charts), data real-time dari API publik Binance.

## Menjalankan

Butuh Node.js 20 atau lebih baru.

```
npm install
npm run dev
```

Buka alamat yang muncul (biasanya http://localhost:5173).

Build untuk produksi: `npm run build`. Hasilnya ada di folder `dist/` dan bisa di-host di mana saja (Netlify, Vercel, GitHub Pages).

## Fitur

- Candlestick real-time via WebSocket, timeframe 1m sampai 1w
- Indikator: Volume, SMA, EMA, RSI (periode bisa diubah)
- **Tab**: tiap tab punya simbol, timeframe, dan indikator sendiri
  - klik ganda = pin (tab di-pin pindah ke depan dan tidak bisa ditutup)
  - seret untuk mengubah urutan, klik tengah untuk menutup
  - "Buka lagi" memulihkan tab yang terakhir ditutup
  - hanya tab aktif yang memuat chart, jadi banyak tab tetap ringan
- **Grup tab**: maksimal 10 grup (mis. "Utama", "Altcoin"), bisa diganti nama dan dihapus
- **Toast**: info/sukses hilang setelah 2,5 detik, error 4 detik, alert harga menetap sampai diklik
- Watchlist dengan harga dan perubahan 24 jam secara live (tombol "+tab" membuka simbol di tab baru)
- Garis horizontal (klik "Garis horizontal" lalu klik di chart)
- Alert harga: dipantau walau tab lain yang aktif, tidak pernah terpicu dua kali, klik toast untuk membuka chart-nya
- Pengaturan alert: bunyi on/off, volume, notifikasi desktop (saat tab browser tidak dibuka)
- Semua tab, grup, dan pengaturan tersimpan di browser (localStorage)

## Shortcut

| Tombol | Aksi |
|---|---|
| Alt+T | Tab baru |
| Alt+W | Tutup tab |
| Alt+Shift+T | Buka lagi tab yang terakhir ditutup |
| Alt+1 … Alt+9 | Pindah ke tab ke-1 … ke-9 |

## Struktur

- `src/lib/binance.js`: REST dan WebSocket Binance
- `src/lib/indicators.js`: perhitungan SMA, EMA, RSI
- `src/lib/workspace.js`: state tab dan grup tab (fungsi murni)
- `src/components/Chart.jsx`: chart dan indikator
- `src/components/TabBar.jsx`: baris tab dan pemilih grup
- `src/components/Toasts.jsx`: sistem toast dan aturan per jenis
- `src/components/Settings.jsx`: pengaturan alert
- `src/components/Sidebar.jsx`: watchlist, garis, alert
- `src/App.jsx`: toolbar, shortcut, dan logika alert

## Tes

```
npm run build
node tests/e2e.cjs   # butuh paket playwright
```

## Online

Setiap push ke `main` otomatis di-build dan dipublikasikan ke GitHub Pages
lewat `.github/workflows/deploy.yml`.

## Catatan

Data diambil dari `data-api.binance.vision` (mirror data pasar resmi Binance, read-only, tanpa API key).
Alert hanya berjalan selama tab aplikasi terbuka.
