/* global console, process, document */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.env.RELAY_SITE_URL || 'http://127.0.0.1:4180';
const output = 'test-results/website';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function context(viewport) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return { ctx, page };
}
const desktop = await context({ width: 1440, height: 1000 });
await desktop.page.goto(base, { waitUntil: 'networkidle' });
await desktop.page.getByRole('heading', { name: 'Relay is powerful. It is not risk-free.' }).waitFor();
const riskBox = await desktop.page.locator('#caveats').boundingBox();
const heroBox = await desktop.page.locator('.hero').boundingBox();
if (!riskBox || !heroBox || riskBox.y >= heroBox.y)
  errors.push('risk disclosure is not visually before hero');
await desktop.page.screenshot({ path: `${output}/home.png`, fullPage: true });
await desktop.page.goto(`${base}/demo/`, { waitUntil: 'networkidle' });
await desktop.page.getByText('nothing is posted', { exact: false }).waitFor();
await desktop.page.getByRole('button', { name: '▶ Run next mock' }).click();
await desktop.page.getByText('Mock publish verified', { exact: true }).waitFor({ timeout: 10000 });
await desktop.page.screenshot({ path: `${output}/demo-timeline.png`, fullPage: false });
await desktop.page.locator('.sidebar [data-view="history"]').click();
await desktop.page.getByRole('heading', { name: 'History that can prove itself.' }).waitFor();
await desktop.page.locator('.proof-button[data-proof="x"]').click();
await desktop.page.getByText('mocksocial.invalid / no real permalink', { exact: true }).waitFor();
await desktop.page.screenshot({ path: `${output}/demo-history.png`, fullPage: false });
await desktop.page
  .getByRole('button', { name: '!   Why no live demo?' })
  .click()
  .catch(async () => desktop.page.locator('#explain-risk').click());
await desktop.page.getByRole('heading', { name: 'A safe demo cannot prove a live post.' }).waitFor();
await desktop.ctx.close();
const mobile = await context({ width: 390, height: 844 });
await mobile.page.goto(`${base}/demo/`, { waitUntil: 'networkidle' });
await mobile.page.getByRole('button', { name: 'Open navigation' }).click();
await mobile.page.locator('.sidebar.open').waitFor();
const overflow = await mobile.page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (overflow > 1) errors.push(`mobile overflow: ${overflow}px`);
await mobile.page.screenshot({ path: `${output}/demo-mobile.png`, fullPage: false });
await mobile.ctx.close();
await browser.close();
if (errors.length) {
  console.error(errors.map((value) => `- ${value}`).join('\n'));
  process.exit(1);
}
console.log(
  'Browser verification passed: risk-first home, mock timeline, history proof, modal, and mobile navigation.',
);
