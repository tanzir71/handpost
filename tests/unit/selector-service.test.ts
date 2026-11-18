import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adapterConfig, getAdapter, setSelectorPatches } from '../../src/main/adapters';
import { openDatabase } from '../../src/main/db/database';
import { SelectorService } from '../../src/main/selectors/service';
import type { SelectorPatch } from '../../src/shared/selectors';

const temps: string[] = [];
afterEach(async () => {
  setSelectorPatches(new Map());
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5 })));
});

async function setup(slash: 'forward' | 'back' = 'forward') {
  const dir = await mkdtemp(join(tmpdir(), 'handpost-selectors-'));
  temps.push(dir);
  const folder = slash === 'forward' ? dir.replace(/\\/g, '/') : dir.replace(/\//g, '\\');
  const db = openDatabase();
  const service = new SelectorService({ db, folder: () => folder, appVersion: '0.2.0' });
  return { db, dir, service };
}
const fix = (slots: SelectorPatch['slots'], extra: Partial<SelectorPatch> = {}): SelectorPatch => ({
  format: 'handpost-selectors/1',
  platform: 'x',
  slots,
  ...extra,
});
const propose = async (dir: string, value: unknown) => {
  await mkdir(join(dir, 'selectors', 'proposed'), { recursive: true });
  await writeFile(
    join(dir, 'selectors', 'proposed', 'x.json'),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
};

describe('applied selector fixes', () => {
  it('are stored per platform and installed into the adapters', async () => {
    const { db, service } = await setup();
    service.save('x', fix({ text: ['div.editor'] }, { replace: ['text'] }));
    expect(db.prepare("SELECT value FROM settings WHERE key='selectors:x'").pluck().get()).toContain(
      'div.editor',
    );
    expect(service.active('x')?.slots.text).toEqual(['div.editor']);
    expect(adapterConfig('x').selectors.text).toEqual(['div.editor']);
    expect(getAdapter('x')).toBe(getAdapter('x'));
    expect(adapterConfig('linkedin').selectors.text).not.toContain('div.editor');
    service.save('x', null);
    expect(service.active('x')).toBeNull();
    expect(adapterConfig('x').selectors.text[0]).toBe('[data-testid="tweetTextarea_0"]');
  });

  it('refuses slots the platform does not have and files for another platform', async () => {
    const { service } = await setup();
    expect(() => service.save('x', fix({ 'option:title': ['#t'] }))).toThrow(/no slot named "option:title"/);
    expect(service.validate('linkedin', fix({ text: ['#t'] })).errors[0]).toMatch(/for x, not linkedin/);
  });

  it('lets a rehearsal try a fix without installing it', async () => {
    await setup();
    const trial = getAdapter('x', fix({ text: ['div.trial'] }));
    expect(trial).not.toBe(getAdapter('x'));
    expect(adapterConfig('x').selectors.text).not.toContain('div.trial');
  });
});

describe('proposed fixes', () => {
  it.each(['forward', 'back'] as const)(
    'are read from selectors/proposed, applied on top of the current fix and archived (%s slashes)',
    async (slash) => {
      const { dir, service } = await setup(slash);
      service.save('x', fix({ submit: ['button.mine'] }, { replace: ['submit'] }));
      expect(await service.proposal('x')).toBeNull();
      await propose(dir, fix({ text: ['div.new'] }, { note: 'X renamed the editor' }));
      const proposal = await service.proposal('x');
      expect(proposal?.errors).toEqual([]);
      expect(proposal?.patch?.note).toBe('X renamed the editor');
      expect(adapterConfig('x').selectors.text).not.toContain('div.new');

      const merged = await service.applyProposal('x');
      expect(merged.slots).toEqual({ submit: ['button.mine'], text: ['div.new'] });
      expect(merged.replace).toEqual(['submit']);
      expect(adapterConfig('x').selectors.text[0]).toBe('div.new');
      expect(existsSync(join(dir, 'selectors', 'proposed', 'x.json'))).toBe(false);
      expect((await readdir(join(dir, 'selectors', 'archive')))[0]).toMatch(/^x-.*-applied\.json$/);
    },
  );

  it('reports problems instead of applying a broken file, and can discard it', async () => {
    const { dir, service } = await setup();
    await propose(dir, '{ not json');
    expect((await service.proposal('x'))?.errors[0]).toMatch(/^Not valid JSON/);
    await expect(service.applyProposal('x')).rejects.toThrow(/cannot be applied/);
    await propose(dir, fix({ text: ['a\nb'] }));
    expect((await service.proposal('x'))?.errors[0]).toMatch(/one line/);
    await propose(dir, { ...fix({ text: ['#a'] }), platform: 'linkedin' });
    expect((await service.proposal('x'))?.patch).toBeNull();
    await service.discardProposal('x');
    expect(await service.proposal('x')).toBeNull();
    expect((await readdir(join(dir, 'selectors', 'archive')))[0]).toMatch(/-discarded\.json$/);
    expect(service.active('x')).toBeNull();
  });
});

describe('repair reports', () => {
  it('record the step, its slots and the selectors that were tried, and say what to do next', async () => {
    const { service } = await setup();
    service.save('x', fix({ text: ['div.mine'] }));
    const dir = await service.capture({
      page: null,
      platform: 'x',
      step: 'fill text',
      error: new Error('locator.fill: Timeout 30000ms exceeded.\nCall log: …'),
      kind: 'failed',
    });
    expect(dir).not.toBeNull();
    const report = JSON.parse(await readFile(join(dir!, 'report.json'), 'utf8'));
    expect(report).toMatchObject({
      format: 'handpost-selector-report/1',
      platform: 'x',
      step: 'fill text',
      slots: ['text'],
      kind: 'failed',
      error: 'locator.fill: Timeout 30000ms exceeded.',
      appVersion: '0.2.0',
      files: { html: null, screenshot: null },
    });
    expect(report.selectors.text[0]).toBe('div.mine');
    const view = await service.view('x');
    expect(view.report?.step).toBe('fill text');
    expect(view.prompt).toContain(join(dir!, 'report.json'));
    expect(view.prompt).toContain(service.proposalPath('x'));
    expect(view.prompt).toContain('handpost-selectors');
    expect((await service.overview()).find((row) => row.platform === 'x')).toMatchObject({
      overrides: 1,
      proposal: false,
      report: { step: 'fill text', kind: 'failed', fixedAfter: false },
    });
    // A fix saved after the report means the card no longer needs to ask for one.
    await new Promise((resolve) => setTimeout(resolve, 5));
    service.save('x', fix({ text: ['div.mine', 'div.better'] }));
    expect((await service.overview()).find((row) => row.platform === 'x')?.report?.fixedAfter).toBe(true);
  });

  it('reuse a fresh report for retries of the same step and keep the newest five', async () => {
    const { dir, service } = await setup();
    const first = await service.capture({ page: null, platform: 'x', step: 'submit', kind: 'failed' });
    expect(await service.capture({ page: null, platform: 'x', step: 'submit', kind: 'failed' })).toBe(first);
    for (let index = 0; index < 7; index++) {
      await service.capture({ page: null, platform: 'x', step: `step ${index}`, kind: 'failed' });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(await readdir(join(dir, 'selectors', 'reports', 'x'))).toHaveLength(5);
    expect((await service.latestReport('x'))?.step).toBe('step 6');
  });

  it('come with the guide in selectors/README.md, which the prompt points to', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handpost-selectors-'));
    temps.push(dir);
    const service = new SelectorService({
      db: openDatabase(),
      folder: () => dir,
      appVersion: '0.2.0',
      guide: '# Fixing Handpost selectors\n',
    });
    const view = await service.view('linkedin');
    expect(await readFile(join(dir, 'selectors', 'README.md'), 'utf8')).toBe('# Fixing Handpost selectors\n');
    expect(existsSync(join(dir, 'selectors', 'proposed'))).toBe(true);
    expect(view.prompt).toContain(`Follow the instructions in ${join(dir, 'selectors', 'README.md')}`);
    expect(view.prompt).toContain('no failure report yet');
  });

  it('cannot be checked without a snapshot', async () => {
    const { service } = await setup();
    await expect(service.check('x', fix({ text: ['#a'] }))).rejects.toThrow(/no page snapshot/);
  });
});
