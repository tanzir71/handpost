/**
 * Renderer smoke check (H3/H4): serves the renderer with Vite (demo data, no Electron), then in headless
 * Chromium walks every screen in light and dark, the component gallery, and a keyboard-only pass. Fails on any
 * console error, page error or Vite overlay. Screenshots land in test-results/ui/.
 *
 *   npx tsx scripts/verify-ui.ts            # uses its own Vite server on a free port
 *   UI_URL=http://127.0.0.1:5173 npx tsx scripts/verify-ui.ts   # reuse a running dev server
 */
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

const SCREENS = [
  ['inbox', 'Inbox'],
  ['compose', 'Compose'],
  ['calendar', null],
  ['queue', 'Queue'],
  ['accounts', 'Accounts'],
  ['history', 'History'],
  ['settings', 'Settings'],
] as const;
const OUT = 'test-results/ui';

let server: Awaited<ReturnType<typeof createServer>> | null = null;
let base = process.env.UI_URL;
if (!base) {
  server = await createServer({
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not start');
  base = `http://127.0.0.1:${address.port}`;
}
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const watch = (page: Page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
};
const overlay = (page: Page) => page.locator('vite-error-overlay, .vite-error-overlay').count();

try {
  const summary: Record<string, unknown> = {};
  for (const scheme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    watch(page);
    await page.goto(`${base}/#/inbox`, { waitUntil: 'networkidle' });
    if ((await page.title()) !== 'Handpost') throw new Error(`Unexpected title ${await page.title()}`);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    summary[`${scheme}Background`] = background;
    for (const [screen, heading] of SCREENS) {
      await page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('button', { name: new RegExp(`^${screen}`, 'i') })
        .click();
      if (heading) await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
      else await page.locator('.calendar').waitFor();
      if (await overlay(page)) throw new Error(`Vite overlay on ${screen}`);
      await page.screenshot({ path: `${OUT}/${screen}-${scheme}.png` });
    }
    // Inbox: filter, select, receipt panel.
    await page.goto(`${base}/#/inbox`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Held for review/ }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('heading', { name: 'launch-week-day-3' }).waitFor();
    await page.screenshot({ path: `${OUT}/inbox-receipt-${scheme}.png` });
    // Settings tabs.
    for (const tab of ['Automation', 'Data & export', 'About']) {
      await page.goto(`${base}/#/settings`, { waitUntil: 'networkidle' });
      await page.getByRole('tab', { name: tab }).click();
      await page.screenshot({
        path: `${OUT}/settings-${tab.toLowerCase().replace(/\W+/g, '-')}-${scheme}.png`,
      });
    }
    // Accounts: the slots & caps modal.
    await page.goto(`${base}/#/accounts`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Slots & caps' }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${OUT}/accounts-slots-${scheme}.png` });
    await page.keyboard.press('Escape');
    await page.close();
  }

  // Component gallery in both themes side by side (dev-only route).
  const gallery = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(gallery);
  await gallery.goto(`${base}/#/__gallery`, { waitUntil: 'networkidle' });
  await gallery.getByRole('heading', { name: 'Component gallery' }).first().waitFor();
  summary.galleryPanels = await gallery.locator('[data-theme]').count();
  await gallery.screenshot({ path: `${OUT}/gallery.png`, fullPage: true });
  await gallery.close();

  // Keyboard-only walkthrough: Tab reaches the nav, Enter switches screens, focus is always visible.
  const keys = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(keys);
  await keys.goto(`${base}/#/inbox`, { waitUntil: 'networkidle' });
  let reached = 0;
  for (let step = 0; step < 40 && reached < SCREENS.length; step++) {
    await keys.keyboard.press('Tab');
    const label = await keys.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el?.closest('nav[aria-label="Primary"]')) return null;
      const outline = getComputedStyle(el).outlineStyle;
      return { text: el.textContent?.trim() ?? '', outline };
    });
    if (label) {
      if (label.outline === 'none') throw new Error(`No focus ring on nav item ${label.text}`);
      reached++;
    }
  }
  if (reached < SCREENS.length) throw new Error(`Keyboard reached only ${reached} nav items`);
  await keys.keyboard.press('Enter');
  await keys.waitForTimeout(200);
  summary.keyboardNavItems = reached;
  await keys.close();

  if (errors.length) throw new Error(`Console errors: ${JSON.stringify(errors)}`);
  console.log(`UI verification passed: ${JSON.stringify({ ...summary, screens: SCREENS.length, out: OUT })}`);
} finally {
  await browser.close();
  await server?.close();
}
