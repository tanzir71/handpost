/* global console, process, document, Buffer */
// Renders the landing page images: site/assets/inbox.png and inbox-dark.png (the real Inbox screen from the
// renderer's built-in demo data, 1440×900 @2x) and site/og.png (1200×630 social card).
// Usage: node scripts/site-shot.mjs [inbox|og] — starts its own Vite server on 127.0.0.1:5199 and stops it after.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('site');
const port = 5199;

async function shootInbox(browser) {
  const server = await createServer({
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  try {
    await mkdir(path.join(root, 'assets'), { recursive: true });
    for (const [colorScheme, file] of [
      ['light', 'assets/inbox.png'],
      ['dark', 'assets/inbox-dark.png'],
    ]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/#/inbox`, { waitUntil: 'networkidle' });
      await page.getByRole('option').first().click();
      await page.waitForTimeout(400);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(root, file) });
      await context.close();
    }
  } finally {
    await server.close();
  }
}

async function fontFace(family, file, style = 'normal', weight = 400) {
  const data = Buffer.from(await readFile(path.join(root, 'fonts', file))).toString('base64');
  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}

async function shootOg(browser) {
  const fonts = [
    await fontFace('Instrument Serif', 'instrument-serif-latin-400-normal.woff2'),
    await fontFace('Instrument Serif', 'instrument-serif-latin-400-italic.woff2', 'italic'),
    await fontFace('Instrument Sans', 'instrument-sans-latin-400-normal.woff2'),
    await fontFace('IBM Plex Mono', 'ibm-plex-mono-latin-500-normal.woff2', 'normal', 500),
  ].join('\n');
  const mark = await readFile(path.join(root, 'favicon.svg'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
*{box-sizing:border-box}html,body{margin:0}
body{width:1200px;height:630px;background:#f4efe6;color:#1d1a15;font-family:'Instrument Sans',sans-serif;position:relative;overflow:hidden}
.stripe{position:absolute;left:0;right:0;height:12px;background:repeating-linear-gradient(-55deg,#b8351f 0 11px,transparent 11px 22px,#2340a0 22px 33px,transparent 33px 44px)}
.top{top:0}.bottom{bottom:0}
.lockup{position:absolute;left:84px;top:76px;display:flex;align-items:center;gap:14px;font-family:'Instrument Serif',serif;font-size:40px;line-height:1}
.lockup svg{width:38px;height:46px}
h1{position:absolute;left:84px;top:178px;margin:0;font-family:'Instrument Serif',serif;font-weight:400;font-size:112px;line-height:.98;letter-spacing:-.02em;width:760px}
h1 em{color:#b8351f}
p{position:absolute;left:84px;bottom:84px;margin:0;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:20px;letter-spacing:.06em;text-transform:uppercase;color:#5a5246}
.stamp{position:absolute;right:120px;top:150px;width:250px;height:300px;transform:rotate(8deg);filter:drop-shadow(0 18px 30px rgb(29 26 21 / .18))}
.stamp svg{width:100%;height:100%}
.postmark{position:absolute;z-index:2;right:372px;top:382px;width:170px;height:170px;border:3px solid rgb(35 64 160 / .55);border-radius:50%;transform:rotate(-14deg);display:grid;place-items:center;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:15px;letter-spacing:.12em;color:rgb(35 64 160 / .7);text-align:center;line-height:1.5}
.postmark::before{content:'';position:absolute;inset:10px;border:1.5px solid rgb(35 64 160 / .45);border-radius:50%}
</style></head><body>
<div class="stripe top"></div>
<div class="lockup">${mark}<span>Handpost</span></div>
<h1>Your posts, delivered <em>by hand.</em></h1>
<div class="postmark">LOCAL-FIRST<br>NO CLOUD<br>OPEN SOURCE</div>
<div class="stamp">${mark}</div>
<p>Free · open source · runs on your computer</p>
<div class="stripe bottom"></div>
</body></html>`;
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, 'og.png') });
  await context.close();
}

const browser = await chromium.launch();
try {
  const only = process.argv[2];
  if (!only || only === 'inbox') await shootInbox(browser);
  if (!only || only === 'og') await shootOg(browser);
} finally {
  await browser.close();
}
console.log('Rendered site/assets/inbox.png, site/assets/inbox-dark.png and site/og.png');
