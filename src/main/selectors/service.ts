/**
 * Selector fixes (docs/SELECTORS.md).
 *
 * - Applied fixes live in the settings table (`selectors:<platform>`), are written only from Accounts → Selectors,
 *   and are installed into the adapters with `setSelectorPatches`.
 * - Writers (Claude, Codex, a script) put proposals in `<Handpost folder>/selectors/proposed/<platform>.json`.
 *   A proposal does nothing until the owner applies it: anything that can write to the Handpost folder could
 *   otherwise point the Post button at another control on a logged-in page.
 * - When a step cannot find its element, a repair report (report.json, a privacy-reduced page.html and a
 *   screenshot) is written to `selectors/reports/<platform>/<time>/` for the owner or a writer to work from.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import type { HandpostDatabase } from '../db/database';
import { adapterConfigs } from '../adapters/configs';
import { setSelectorPatches } from '../adapters';
import { listSlots, slotSelectors, slotsForStep, unknownSlots, applyPatch } from '../adapters/slots';
import type { AdapterConfig } from '../adapters/types';
import { sanitizeForRepair } from '../engine/sanitize';
import { capabilities } from '../../shared/capabilities';
import type { PlatformId } from '../../shared/types';
import {
  SELECTOR_PATCH_FORMAT,
  SELECTOR_REPORT_FORMAT,
  patchErrors,
  selectorPatchSchema,
  type SelectorCheckResult,
  type SelectorOverviewRow,
  type SelectorPatch,
  type SelectorProposalView,
  type SelectorReportView,
  type SelectorsView,
} from '../../shared/selectors';

export const SELECTORS_DIR = 'selectors';
const KEEP_REPORTS = 5;
/** Retries of the same failing step within this window reuse the existing report. */
const REPORT_COOLDOWN_MS = 10 * 60_000;
const SETTING_PREFIX = 'selectors:';
const SAVED_PREFIX = 'selectorsSavedAt:';

/** Playwright's messages when a locator found nothing in time, or the selector itself is invalid. */
export function isSelectorFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /locator\.[A-Za-z]+: Timeout \d+ms exceeded/.test(message) ||
    /waiting for locator\(/.test(message) ||
    /strict mode violation/.test(message) ||
    /(?:Unexpected token|Unknown engine|is not a valid selector)/.test(message)
  );
}

export interface RepairCapture {
  page: Page | null;
  platform: PlatformId;
  step: string;
  error?: unknown;
  kind: 'failed' | 'possible';
}

interface StoredReport {
  format: typeof SELECTOR_REPORT_FORMAT;
  platform: PlatformId;
  at: string;
  kind: 'failed' | 'possible';
  step: string;
  slots: string[];
  selectors: Record<string, string[]>;
  error: string;
  page: string | null;
  appVersion: string;
  files: { html: string | null; screenshot: string | null };
}

export interface SelectorServiceOptions {
  db: HandpostDatabase;
  /** The Handpost folder (it can change in Settings). */
  folder: () => string;
  appVersion: string;
  /** A headless browser for checking selectors against a snapshot; it gets no network access. */
  launch?: () => Promise<Browser>;
  /** The handpost-selectors skill, written to `selectors/README.md` so agents find the rules next to the reports. */
  guide?: string | undefined;
}

function baseConfig(platform: PlatformId): AdapterConfig {
  const config = adapterConfigs.find((item) => item.id === platform);
  if (!config) throw new Error(`No adapter for ${platform}`);
  return config;
}

const stamp = (date: Date) => date.toISOString().replace(/[:.]/g, '-');
const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error ?? '')).split('\n')[0]!.slice(0, 500);

export class SelectorService {
  constructor(private readonly options: SelectorServiceOptions) {}

  private dir(...parts: string[]): string {
    return join(this.options.folder(), SELECTORS_DIR, ...parts);
  }

  proposalPath(platform: PlatformId): string {
    return this.dir('proposed', `${platform}.json`);
  }

  guidePath(): string {
    return this.dir('README.md');
  }

  /** Creates `selectors/proposed/` and writes the guide (kept equal to the shipped skill). */
  async ensureLayout(): Promise<void> {
    await mkdir(this.dir('proposed'), { recursive: true });
    if (!this.options.guide) return;
    const current = existsSync(this.guidePath()) ? await readFile(this.guidePath(), 'utf8') : null;
    if (current !== this.options.guide) await writeFile(this.guidePath(), this.options.guide, 'utf8');
  }

  /** Validates a patch for a platform: the file format, the platform and every slot name. */
  validate(platform: PlatformId, raw: unknown): { patch: SelectorPatch | null; errors: string[] } {
    const parsed = selectorPatchSchema.safeParse(raw);
    if (!parsed.success) return { patch: null, errors: patchErrors(parsed.error) };
    const errors: string[] = [];
    if (parsed.data.platform !== platform)
      errors.push(`platform: this file is for ${parsed.data.platform}, not ${platform}`);
    const unknown = unknownSlots(baseConfig(platform), parsed.data);
    if (unknown.length)
      errors.push(`slots: ${platform} has no slot named ${unknown.map((key) => `"${key}"`).join(', ')}`);
    return { patch: errors.length ? null : parsed.data, errors };
  }

  active(platform: PlatformId): SelectorPatch | null {
    const raw = this.options.db
      .prepare('SELECT value FROM settings WHERE key=?')
      .pluck()
      .get(`${SETTING_PREFIX}${platform}`) as string | undefined;
    if (!raw) return null;
    try {
      return this.validate(platform, JSON.parse(raw)).patch;
    } catch {
      return null;
    }
  }

  /** Puts every applied fix into effect. Call at start-up and after a data import. */
  install(): void {
    const map = new Map<PlatformId, SelectorPatch>();
    for (const config of adapterConfigs) {
      const patch = this.active(config.id);
      if (patch) map.set(config.id, patch);
    }
    setSelectorPatches(map);
  }

  /** Saves the owner's fix for a platform (null or no slots removes it). */
  save(platform: PlatformId, patch: SelectorPatch | null): void {
    const key = `${SETTING_PREFIX}${platform}`;
    const upsert = this.options.db.prepare(
      'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    );
    if (!patch || Object.keys(patch.slots).length === 0) {
      this.options.db
        .prepare('DELETE FROM settings WHERE key IN (?,?)')
        .run(key, `${SAVED_PREFIX}${platform}`);
    } else {
      const { patch: valid, errors } = this.validate(platform, patch);
      if (!valid) throw new Error(errors.join('; '));
      upsert.run(key, JSON.stringify(valid));
      upsert.run(`${SAVED_PREFIX}${platform}`, new Date().toISOString());
    }
    this.install();
  }

  /** When the owner last saved or applied a fix for the platform. */
  savedAt(platform: PlatformId): string | null {
    return (
      (this.options.db
        .prepare('SELECT value FROM settings WHERE key=?')
        .pluck()
        .get(`${SAVED_PREFIX}${platform}`) as string | undefined) ?? null
    );
  }

  async proposal(platform: PlatformId): Promise<SelectorProposalView | null> {
    const file = this.proposalPath(platform);
    if (!existsSync(file)) return null;
    const modifiedAt = (await stat(file)).mtime.toISOString();
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      return { file, patch: null, errors: [`Not valid JSON: ${firstLine(error)}`], modifiedAt };
    }
    const { patch, errors } = this.validate(platform, raw);
    return { file, patch, errors, modifiedAt };
  }

  private async archive(platform: PlatformId, outcome: 'applied' | 'discarded'): Promise<void> {
    const from = this.proposalPath(platform);
    if (!existsSync(from)) return;
    await mkdir(this.dir('archive'), { recursive: true });
    await rename(from, this.dir('archive', `${platform}-${stamp(new Date())}-${outcome}.json`));
  }

  /** Applies a valid proposal on top of the current fix (slots it names replace the current ones). */
  async applyProposal(platform: PlatformId): Promise<SelectorPatch> {
    const proposal = await this.proposal(platform);
    if (!proposal) throw new Error(`There is no proposed fix for ${platform}`);
    if (!proposal.patch) throw new Error(`The proposed fix cannot be applied: ${proposal.errors.join('; ')}`);
    const current = this.active(platform);
    const replace = new Set([
      ...(current?.replace ?? []).filter((key) => !(key in proposal.patch!.slots)),
      ...(proposal.patch.replace ?? []),
    ]);
    const merged: SelectorPatch = {
      format: SELECTOR_PATCH_FORMAT,
      platform,
      note: proposal.patch.note ?? current?.note,
      slots: { ...(current?.slots ?? {}), ...proposal.patch.slots },
      ...(replace.size ? { replace: [...replace] } : {}),
    };
    this.save(platform, merged);
    await this.archive(platform, 'applied');
    return merged;
  }

  async discardProposal(platform: PlatformId): Promise<void> {
    await this.archive(platform, 'discarded');
  }

  /**
   * Writes a repair report for a step that could not find its element (`failed`), or for a symptom that drift
   * can cause (`possible`: the logged-in marker was missing, or the post was not found on the profile). Never
   * throws; returns the report folder or null.
   */
  async capture({ page, platform, step, error, kind }: RepairCapture): Promise<string | null> {
    try {
      const latest = await this.latestReport(platform);
      if (latest && latest.step === step && Date.now() - Date.parse(latest.at) < REPORT_COOLDOWN_MS)
        return latest.dir;
      const at = new Date();
      const dir = this.dir('reports', platform, stamp(at));
      await mkdir(dir, { recursive: true });
      await this.ensureLayout().catch(() => undefined);
      const config = applyPatch(baseConfig(platform), this.active(platform));
      const slots = slotsForStep(config, step);
      let html: string | null = null;
      let screenshot: string | null = null;
      let url: string | null = null;
      if (page && !page.isClosed()) {
        try {
          const parsed = new URL(page.url());
          url = parsed.protocol.startsWith('http') ? `${parsed.origin}${parsed.pathname}` : null;
        } catch {
          url = null;
        }
        const content = await page.content().catch(() => null);
        if (content) {
          html = 'page.html';
          await writeFile(join(dir, html), sanitizeForRepair(content), 'utf8');
        }
        screenshot = (await page
          .screenshot({ path: join(dir, 'screenshot.png') })
          .then(() => 'screenshot.png')
          .catch(() => null)) as string | null;
      }
      const report: StoredReport = {
        format: SELECTOR_REPORT_FORMAT,
        platform,
        at: at.toISOString(),
        kind,
        step,
        slots,
        selectors: Object.fromEntries(slots.map((key) => [key, slotSelectors(config, key)])),
        error: firstLine(error),
        page: url,
        appVersion: this.options.appVersion,
        files: { html, screenshot },
      };
      await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      await this.prune(platform);
      return dir;
    } catch {
      return null;
    }
  }

  private async reportDirs(platform: PlatformId): Promise<string[]> {
    const root = this.dir('reports', platform);
    if (!existsSync(root)) return [];
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .map((name) => join(root, name));
  }

  private async prune(platform: PlatformId): Promise<void> {
    for (const dir of (await this.reportDirs(platform)).slice(KEEP_REPORTS))
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async readReport(dir: string): Promise<StoredReport | null> {
    try {
      const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')) as StoredReport;
      return report.format === SELECTOR_REPORT_FORMAT ? report : null;
    } catch {
      return null;
    }
  }

  async latestReport(platform: PlatformId): Promise<SelectorReportView | null> {
    for (const dir of await this.reportDirs(platform)) {
      const report = await this.readReport(dir);
      if (!report) continue;
      return {
        dir,
        at: report.at,
        step: report.step,
        slots: report.slots,
        kind: report.kind,
        error: report.error,
        hasHtml: Boolean(report.files.html && existsSync(join(dir, report.files.html))),
      };
    }
    return null;
  }

  /** Instructions for Claude (or another agent) to propose a fix from the latest report. */
  prompt(platform: PlatformId, report: SelectorReportView | null): string {
    const label = capabilities[platform].label;
    const target = this.proposalPath(platform);
    const where = report
      ? [
          `Handpost could not complete the "${report.step}" step on ${label}${report.kind === 'possible' ? ' (this may be selector drift)' : ''}.`,
          `Read ${join(report.dir, 'report.json')}${report.hasHtml ? ` and ${join(report.dir, 'page.html')}` : ''}, and look at ${join(report.dir, 'screenshot.png')} if you can view images.`,
          `The report lists the slots that step uses (${report.slots.join(', ') || 'none recorded'}) and the selectors that matched nothing.`,
        ]
      : [
          `I want to update the selectors Handpost uses on ${label}. There is no failure report yet; ask me which control is broken and to run Rehearse in Handpost → Accounts so it saves one.`,
        ];
    const rules = this.options.guide
      ? `Follow the instructions in ${this.guidePath()} (the handpost-selectors skill)`
      : 'Using the handpost-selectors skill';
    return [
      ...where,
      `${rules}, write replacement selectors as a handpost-selectors/1 file to ${target}.`,
      'Prefer stable hooks (data-testid, aria-label, role with an accessible name, name, placeholder) over generated class names, check each selector matches exactly the right element in page.html, and explain the change in "note".',
      `Do not edit anything else. When you are done, tell me to review it in Handpost → Accounts → ${label} → Selectors, check it against the snapshot, Rehearse with it and apply it.`,
    ].join('\n');
  }

  async view(platform: PlatformId): Promise<SelectorsView> {
    await this.ensureLayout().catch(() => undefined);
    const report = await this.latestReport(platform);
    return {
      platform,
      slots: listSlots(baseConfig(platform)),
      active: this.active(platform),
      proposal: await this.proposal(platform),
      report,
      proposalPath: this.proposalPath(platform),
      prompt: this.prompt(platform, report),
    };
  }

  async overview(): Promise<SelectorOverviewRow[]> {
    const rows: SelectorOverviewRow[] = [];
    for (const config of adapterConfigs) {
      if (config.id === 'mock') continue;
      const report = await this.latestReport(config.id);
      rows.push({
        platform: config.id,
        overrides: Object.keys(this.active(config.id)?.slots ?? {}).length,
        proposal: existsSync(this.proposalPath(config.id)),
        report: report
          ? {
              at: report.at,
              step: report.step,
              kind: report.kind,
              fixedAfter: (this.savedAt(config.id) ?? '') > report.at,
            }
          : null,
      });
    }
    return rows;
  }

  /**
   * Counts what each selector of a patch (by default the proposal) matches in the latest failure snapshot, in a
   * headless browser with JavaScript off and every request blocked.
   */
  async check(platform: PlatformId, patch?: SelectorPatch | null): Promise<SelectorCheckResult> {
    const candidate = patch ?? (await this.proposal(platform))?.patch ?? null;
    if (!candidate) throw new Error('There is no valid fix to check');
    const report = await this.latestReport(platform);
    if (!report?.hasHtml)
      throw new Error(`There is no page snapshot for ${platform} yet; run Rehearse to save one`);
    if (!this.options.launch) throw new Error('Checking needs a browser');
    const html = await readFile(join(report.dir, 'page.html'), 'utf8');
    const browser = await this.options.launch();
    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const rows: SelectorCheckResult['rows'] = [];
      for (const [slot, selectors] of Object.entries(candidate.slots))
        for (const selector of selectors) {
          const relevant = report.slots.includes(slot);
          try {
            rows.push({ slot, selector, matches: await page.locator(selector).count(), relevant });
          } catch (error) {
            rows.push({ slot, selector, matches: null, error: firstLine(error), relevant });
          }
        }
      return { report: report.dir, rows };
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
}
