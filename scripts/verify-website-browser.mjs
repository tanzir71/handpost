/* global console, process, document, window, URL */
// Serves site/ under /handpost/ (like https://tanzir71.github.io/handpost/) with a tiny local server, then loads
// the landing page and the mock demo in headless Chromium at 1440, 1080, 720 and 390 px. Fails on console errors,
// page errors, failed or 4xx/5xx requests, any request to another origin, and horizontal overflow.
// Screenshots: test-results/site/.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('site');
const prefix = '/handpost/';
const output = path.resolve('test-results/site');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === prefix.slice(0, -1)) {
    response.writeHead(301, { location: prefix }).end();
    return;
  }
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404).end('outside /handpost/');
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname.slice(prefix.length)));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { location: `${url.pathname}/` }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = `${origin}${prefix}`;

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];

async function open(label, viewport, colorScheme = 'light') {
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: page error: ${error.message}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:'))
      errors.push(`${label}: request to another origin: ${url}`);
  });
  page.on('requestfailed', (request) =>
    errors.push(`${label}: request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  return { context, page };
}
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Landing page at the four design widths.
for (const width of [1440, 1080, 720, 390]) {
  const label = `home@${width}`;
  const { context, page } = await open(label, { width, height: 900 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('heading', { level: 1, name: 'Your posts, delivered by hand.' }).waitFor();
  await page.getByRole('heading', { name: 'Powerful. Not risk-free.' }).waitFor();
  const shot = await page
    .locator('.shot img')
    .evaluate((img) => ({ ok: img.complete && img.naturalWidth > 0 }));
  if (!shot.ok) errors.push(`${label}: product shot did not load`);
  if (!(await page.locator('#platforms table').isVisible()))
    errors.push(`${label}: platforms table is hidden`);
  for (const scope of ['#support', 'footer']) {
    const link = page.locator(`${scope} a[href="https://buymeacoffee.com/tanzir"]`).first();
    if ((await link.getAttribute('target')) !== '_blank' || !(await link.isVisible()))
      errors.push(`${label}: Buy Me a Coffee link missing or hidden in ${scope}`);
  }
  const extra = await overflow(page);
  if (extra > 1) errors.push(`${label}: horizontal page overflow of ${extra}px`);

  const menu = page.locator('details.menu');
  if (width <= 720) {
    if (await page.locator('.nav__links').isVisible()) errors.push(`${label}: nav links should collapse`);
    await menu.locator('summary').click();
    await page.locator('.menu__panel a[href="#caveats"]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, `home-${width}-menu.png`) });
    await page.locator('.menu__panel a[href="#caveats"]').click();
    if (await menu.evaluate((node) => node.open))
      errors.push(`${label}: menu stays open after choosing a link`);
    const shotWidth = await page.locator('.shot img').evaluate((img) => img.getBoundingClientRect().width);
    if (shotWidth < 1000) errors.push(`${label}: product shot shrank to ${shotWidth}px instead of scrolling`);
    const firstFaq = page.locator('.faq__item').first();
    if (await firstFaq.evaluate((node) => node.open)) errors.push(`${label}: FAQ should start collapsed`);
    await firstFaq.locator('summary').click();
    if (!(await firstFaq.evaluate((node) => node.open))) errors.push(`${label}: FAQ item does not expand`);
  } else {
    if (width >= 1080 && !(await page.locator('.nav__links').isVisible()))
      errors.push(`${label}: nav links should be visible`);
    const closed = await page.locator('.faq__item:not([open])').count();
    if (closed) errors.push(`${label}: ${closed} FAQ answers are collapsed on a wide screen`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
  await context.close();
}

// Dark theme follows the system.
{
  const { context, page } = await open('home@1440-dark', { width: 1440, height: 900 }, 'dark');
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const src = await page.locator('.shot img').evaluate((img) => img.currentSrc);
  if (!src.endsWith('inbox-dark.png')) errors.push(`home@1440-dark: dark product shot not used (${src})`);
  await page.screenshot({ path: path.join(output, 'home-1440-dark.png'), fullPage: true });
  await context.close();
}

// Mock demo: still a pure simulation, now under the prefix.
{
  const { context, page } = await open('demo@1440', { width: 1440, height: 900 });
  await page.goto(`${base}demo/`, { waitUntil: 'networkidle' });
  await page.getByText('nothing is posted', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Run next mock' }).click();
  await page.getByText('Mock publish verified', { exact: true }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(output, 'demo-timeline.png') });
  await page.locator('.sidebar [data-view="history"]').click();
  await page.getByRole('heading', { name: 'History that can prove itself.' }).waitFor();
  await page.locator('.proof-button[data-proof="x"]').click();
  await page.getByText('mocksocial.invalid / no real permalink', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'demo-history.png') });
  await page.locator('#explain-risk').click();
  await page.getByRole('heading', { name: 'A safe demo cannot prove a live post.' }).waitFor();
  await page.screenshot({ path: path.join(output, 'demo-dialog.png') });
  await page.locator('.dialog-secondary').click();
  await page.locator('#theme').click();
  await page.screenshot({ path: path.join(output, 'demo-dark.png') });
  await context.close();
}
{
  const { context, page } = await open('demo@390', { width: 390, height: 844 });
  await page.goto(`${base}demo/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar.open').waitFor();
  const extra = await overflow(page);
  if (extra > 1) errors.push(`demo@390: horizontal page overflow of ${extra}px`);
  await page.screenshot({ path: path.join(output, 'demo-390.png') });
  await context.close();
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.map((value) => `- ${value}`).join('\n'));
  process.exit(1);
}
console.log(
  `Browser verification passed under ${prefix}: landing page at 1440/1080/720/390 px (+ dark), mock demo flows; no console errors, failed requests, third-party requests or overflow. Screenshots in test-results/site/.`,
);
