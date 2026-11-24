// Tes end-to-end: sajikan dist/ lalu jalankan Chromium headless.
// Jalankan: npm run build && PW=<path playwright> node tests/e2e.cjs
const { chromium } = require(process.env.PW || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let p = path.join(root, req.url.split('?')[0]);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(4173);

const tabs = (page) => page.$$eval('.tab', (els) => els.map((e) => ({
  text: e.querySelector('.tab-symbol').textContent, active: e.classList.contains('active'), pinned: e.classList.contains('pinned'),
})));
const toastTexts = (page) => page.$$eval('.toast .toast-msg', (els) => els.map((e) => e.textContent));
const step = (name) => console.log('✓', name);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // Ganti stream ticker dengan stream palsu supaya alert bisa dipicu secara pasti.
  let tickerSocket = null;
  await page.routeWebSocket(/data-stream\.binance\.vision\/stream/, (ws) => { tickerSocket = ws; });
  const sendTick = (s, price) => tickerSocket.send(JSON.stringify({ stream: `${s.toLowerCase()}@miniTicker`, data: { s, c: String(price), o: String(price) } }));

  await page.goto('http://localhost:4173');
  await page.waitForSelector('.legend strong');
  await page.waitForTimeout(3000);
  assert.deepStrictEqual((await tabs(page)).map((t) => t.text), ['BTCUSDT']);
  step('1 tab awal BTCUSDT');

  // Tab baru menyalin tab aktif, lalu ganti simbol lewat watchlist
  await page.click('.new-tab');
  await page.click('.sidebar .list tr:has-text("ETHUSDT")');
  await page.waitForTimeout(2500);
  let t = await tabs(page);
  assert.deepStrictEqual(t.map((x) => x.text), ['BTCUSDT', 'ETHUSDT']);
  assert.ok(t[1].active);
  assert.match(await page.textContent('.legend'), /ETHUSDT/);
  step('tab baru + ganti simbol: ' + t.map((x) => x.text).join(', '));

  // Timeframe per tab
  await page.click('button:text-is("15m")');
  await page.click('.tab:has-text("BTCUSDT")');
  await page.waitForTimeout(1500);
  assert.match(await page.textContent('.legend'), /BTCUSDT 1h/);
  await page.click('.tab:has-text("ETHUSDT")');
  await page.waitForTimeout(1500);
  assert.match(await page.textContent('.legend'), /ETHUSDT 15m/);
  step('timeframe tersimpan per tab (BTC 1h, ETH 15m)');

  // Buka di tab baru dari watchlist
  await page.click('.sidebar .list tr:has-text("SOLUSDT") button[title="Buka di tab baru"]');
  await page.waitForTimeout(1500);
  assert.deepStrictEqual((await tabs(page)).map((x) => x.text), ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  step('buka SOLUSDT di tab baru');

  // Pin: pindah ke depan dan tidak bisa ditutup
  await page.dblclick('.tab:has-text("SOLUSDT")');
  t = await tabs(page);
  assert.strictEqual(t[0].text, 'SOLUSDT');
  assert.ok(t[0].pinned);
  await page.click('.tab:has-text("SOLUSDT")');
  await page.keyboard.press('Alt+w');
  assert.strictEqual((await tabs(page)).length, 3);
  assert.ok((await toastTexts(page)).some((m) => m.includes('Lepas pin')));
  step('pin tab: pindah ke depan, Alt+W ditolak dengan toast');

  // Tutup lalu buka lagi
  await page.click('.tab:has-text("ETHUSDT") .tab-close');
  assert.deepStrictEqual((await tabs(page)).map((x) => x.text), ['SOLUSDT', 'BTCUSDT']);
  await page.click('.reopen');
  await page.waitForTimeout(1000);
  assert.deepStrictEqual((await tabs(page)).map((x) => x.text), ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  step('tutup tab ETH lalu buka lagi (↺)');

  // Shortcut Alt+1
  await page.keyboard.press('Alt+1');
  assert.ok((await tabs(page))[0].active);
  step('Alt+1 pindah ke tab pertama');

  // Grup tab
  page.once('dialog', (d) => d.accept('Altcoin'));
  await page.click('button[title="Grup baru"]');
  await page.waitForTimeout(1000);
  assert.strictEqual((await tabs(page)).length, 1);
  const options = await page.$$eval('.group-picker option', (o) => o.map((x) => x.textContent));
  assert.deepStrictEqual(options, ['Utama (3)', 'Altcoin (1)']);
  await page.selectOption('.group-picker select', { label: 'Utama (3)' });
  assert.strictEqual((await tabs(page)).length, 3);
  step('grup tab: ' + options.join(', '));

  // Tersimpan setelah reload
  await page.reload();
  await page.waitForSelector('.tab');
  await page.waitForTimeout(2500);
  t = await tabs(page);
  assert.deepStrictEqual(t.map((x) => x.text), ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  assert.ok(t[0].pinned);
  step('tab, pin, dan grup tetap ada setelah reload');

  // Toast error simbol salah
  await page.fill('input[placeholder^="Tambah simbol"]', 'XXXNOPE');
  await page.click('.sidebar section:nth-child(1) form button[type=submit]');
  await page.waitForSelector('.toast-error');
  step('toast error: ' + (await page.textContent('.toast-error .toast-msg')));

  // Alert: pasang alert BTC 150, kirim harga 100 -> 200, toast alert harus muncul dan menetap
  await page.click('.tab:has-text("BTCUSDT")');
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Harga alert"]', '150');
  await page.click('text=+ Alert');
  await page.click('.tab:has-text("ETHUSDT")'); // pindah tab: alert BTC tetap dipantau
  await page.waitForTimeout(500);
  sendTick('BTCUSDT', 100);
  await page.waitForTimeout(200);
  sendTick('BTCUSDT', 200);
  await page.waitForSelector('.toast-alert');
  const alertMsg = await page.textContent('.toast-alert .toast-msg');
  assert.match(alertMsg, /BTCUSDT menyentuh 150/);
  step('alert terpicu walau tab lain aktif: ' + alertMsg);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-1.png') });

  // Alert yang sama tidak terpicu dua kali
  sendTick('BTCUSDT', 100);
  sendTick('BTCUSDT', 200);
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator('.toast-alert').count(), 1);
  await page.waitForTimeout(4500);
  assert.strictEqual(await page.locator('.toast-alert').count(), 1, 'toast alert harus menetap');
  assert.strictEqual(await page.locator('.toast-error').count(), 0, 'toast error harus hilang sendiri');
  step('alert tidak dobel, toast alert menetap, toast lain hilang otomatis');

  // Klik toast alert membuka tab BTC
  await page.click('.toast-alert');
  await page.waitForTimeout(1500);
  assert.ok((await tabs(page)).find((x) => x.text === 'BTCUSDT').active);
  assert.strictEqual(await page.locator('.toast-alert').count(), 0);
  assert.strictEqual(await page.locator('.log li').count(), 1);
  step('klik toast alert membuka tab BTCUSDT, riwayat alert tercatat');

  // Pengaturan alert
  await page.click('button[title="Pengaturan alert"]');
  await page.waitForSelector('.popover');
  await page.screenshot({ path: path.join(__dirname, 'screenshot-2.png') });
  step('popover pengaturan alert terbuka');

  console.log('page errors:', errors);
  assert.strictEqual(errors.length, 0);
  console.log('SEMUA TES LULUS');
  await browser.close();
  srv.close();
})().catch(async (e) => { console.error('GAGAL:', e.message); srv.close(); process.exit(1); });
