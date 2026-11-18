import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adapterConfigs } from '../../src/main/adapters/configs';
import { createAdapter, type AdapterInteractions } from '../../src/main/adapters/factory';
import { applyPatch } from '../../src/main/adapters/slots';
import { openDatabase } from '../../src/main/db/database';
import { StepReporter } from '../../src/main/engine/reporter';
import { SelectorService, isSelectorFailure } from '../../src/main/selectors/service';
import type { SelectorPatch } from '../../src/shared/selectors';

const port = 4183;
const fixtureUrl = `http://127.0.0.1:${port}/x`;
let server: Server;
let browser: Browser;
let root: string;
const fast: AdapterInteractions = {
  pause: async () => {},
  type: async (locator, text) => locator.fill(text),
  click: async (locator) => locator.click(),
};
const x = adapterConfigs.find((config) => config.id === 'x')!;
const patch = (slots: SelectorPatch['slots'], replace?: string[]): SelectorPatch => ({
  format: 'handpost-selectors/1',
  platform: 'x',
  slots,
  ...(replace ? { replace } : {}),
});
/** X after a "redesign": none of the post text box selectors match any more. */
const broken = applyPatch(
  { ...x, home: fixtureUrl, compose: fixtureUrl, profile: fixtureUrl },
  patch({ text: ['[data-testid="textbox-that-no-longer-exists"]'] }, ['text']),
);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'handpost-selector-repair-'));
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(readFileSync('tests/fixtures/x/compose.html'));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({ headless: true });
}, 30_000);
afterAll(async () => {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

describe('selector repair on the X fixture', () => {
  it('saves a snapshot when a step finds nothing, checks a fix against it, and the fix rehearses cleanly', async () => {
    const service = new SelectorService({
      db: openDatabase(),
      folder: () => join(root, 'Handpost'),
      appVersion: 'test',
      launch: () => chromium.launch({ headless: true }),
    });
    const post = { text: 'Fixture post prefix', media: [], options: {}, artifactDir: join(root, 'proof') };

    // 1. The broken adapter stops at "fill text"; the failure is recognised and a report is saved.
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(1_500);
    const reporter = new StepReporter(page, join(root, 'failures'));
    const error = await createAdapter(broken, fast)
      .publish(context, post, reporter, { rehearse: true })
      .then(() => null)
      .catch((value: unknown) => value);
    expect(isSelectorFailure(error)).toBe(true);
    const failed = reporter.logs.find((log) => log.outcome === 'failed');
    expect(failed?.name).toBe('fill text');
    const dir = await service.capture({ page, platform: 'x', step: failed!.name, error, kind: 'failed' });
    await context.close();
    expect(dir).not.toBeNull();
    const report = JSON.parse(await readFile(join(dir!, 'report.json'), 'utf8'));
    expect(report).toMatchObject({ step: 'fill text', slots: ['text'], page: fixtureUrl, kind: 'failed' });
    expect(report.error).toMatch(/^locator\.fill: Timeout/);
    await access(join(dir!, 'screenshot.png'));
    const html = await readFile(join(dir!, 'page.html'), 'utf8');
    expect(html).toContain('data-testid="tweetTextarea_0"');
    expect(html).not.toMatch(/<script\b/i);

    // 2. A proposed fix is checked against the snapshot in a browser with no network and no JavaScript.
    const fix = patch({
      text: ['[data-testid="tweetTextarea_0"]', '[data-testid="still-missing"]', 'div[[broken'],
      submit: ['[data-testid="tweetButton"]'],
    });
    const check = await service.check('x', fix);
    const row = (selector: string) => check.rows.find((item) => item.selector === selector)!;
    expect(row('[data-testid="tweetTextarea_0"]')).toMatchObject({ slot: 'text', relevant: true });
    expect(row('[data-testid="tweetTextarea_0"]').matches).toBeGreaterThan(0);
    expect(row('[data-testid="still-missing"]').matches).toBe(0);
    expect(row('div[[broken').matches).toBeNull();
    expect(row('[data-testid="tweetButton"]')).toMatchObject({ slot: 'submit', relevant: false });

    // 3. With the fix layered on top, the same broken adapter rehearses to the end and never reaches submit.
    const repaired = applyPatch(broken, patch({ text: ['[data-testid="tweetTextarea_0"]'] }));
    const second = await browser.newContext();
    const page2 = await second.newPage();
    const reporter2 = new StepReporter(page2, join(root, 'failures'));
    const result = await createAdapter(repaired, fast).publish(second, post, reporter2, { rehearse: true });
    expect(result).toMatchObject({ submitted: false, signal: 'rehearsal' });
    expect(reporter2.logs.map((log) => log.name)).toEqual([
      'open composer',
      'fill text',
      'screenshot filled composer',
      'discard draft',
    ]);
    await second.close();
  }, 60_000);
});
