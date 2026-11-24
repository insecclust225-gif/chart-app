// Cek situs yang sudah online: chart tampil, data live, tanpa error. Desktop dan HP.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const URL = process.env.URL || 'https://insecclust225-gif.github.io/chart-app/';

(async () => {
  const browser = await chromium.launch();
  for (const [name, viewport, mobile] of [['desktop', { width: 1400, height: 800 }, false], ['hp', { width: 390, height: 844 }, true]]) {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
    await page.goto(URL);
    await page.waitForSelector('.legend strong', { timeout: 20000 });
    await page.waitForTimeout(5000);
    const legend = await page.textContent('.legend');
    const canvases = await page.locator('.chart canvas').count();
    const prices = await page.$$eval('.sidebar .list tr td.num', (t) => t.slice(0, 2).map((x) => x.textContent));
    console.log(`${name}: legend="${legend.trim()}" canvas=${canvases} watchlist=${prices.join(' | ')} errors=${JSON.stringify(errors)}`);
    await page.screenshot({ path: path.join(__dirname, `live-${name}.png`) });
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
