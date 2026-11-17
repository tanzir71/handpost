import type { Locator, Page } from 'playwright';
import { capabilities, validatePost } from '../../shared/capabilities';
import type { PublishError } from '../../shared/types';
import { humanClick, humanType, pause } from '../engine/humanizer';
import type { PlatformAdapter, AdapterConfig } from './types';
import { identityFromPath, type AccountIdentity } from './identity';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

function combined(page: Page, selectors: string[]): Locator {
  const locators = selectors.map((selector) => page.locator(selector));
  return locators.slice(1).reduce((current, locator) => current.or(locator), locators[0]!);
}
export function first(page: Page, selectors: string[]): Locator {
  return combined(page, selectors).first();
}
function failure(errorClass: PublishError['errorClass'], code: string, message: string): PublishError {
  return Object.assign(new Error(message), { errorClass, code });
}
export interface AdapterInteractions {
  pause(page: Page): Promise<void>;
  type(locator: Locator, text: string): Promise<void>;
  click(locator: Locator): Promise<void>;
}
const productionInteractions: AdapterInteractions = { pause, type: humanType, click: humanClick };
/** "Discard post?" confirmations seen on the supported platforms, plus the fixture marker. */
const DEFAULT_DISCARD = [
  'button:has-text("Discard")',
  'div[role="button"]:has-text("Discard")',
  '[data-testid="confirmationSheetConfirm"]',
  '[data-handpost="discard"]',
];
/** Single-page apps (X, Threads…) render after DOMContentLoaded; wait for the page to settle or for a known marker. */
async function settle(page: Page, markers: string[], timeout = 10_000): Promise<void> {
  const quiet = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      () => undefined,
    );
  await Promise.race([
    quiet(page.waitForLoadState('networkidle', { timeout })),
    quiet(combined(page, markers).first().waitFor({ state: 'attached', timeout })),
  ]);
}
export function createAdapter(
  config: AdapterConfig,
  interactions: AdapterInteractions = productionInteractions,
): PlatformAdapter {
  const validate = (post: Parameters<PlatformAdapter['validate']>[0]) => {
    const errors = validatePost(config.id, post);
    for (const field of config.optionFields ?? []) {
      const value = post.options?.[field.key];
      if (field.required && (value === undefined || value === '')) errors.push(`${field.label} is required`);
    }
    return errors;
  };
  /** The only place the submit locator is created; refuses outright during a rehearsal. */
  const submitButton = (page: Page, rehearse: boolean): Locator => {
    if (rehearse) throw failure('content', 'rehearsal_submit', 'Rehearsal must never reach the submit step');
    return first(page, config.selectors.submit);
  };
  /** Rehearsal ending: screenshot the filled composer, then discard it (Escape, confirm "Discard"). */
  const rehearseEnd = async (
    page: Page,
    artifactDir: string | undefined,
    report: Parameters<PlatformAdapter['publish']>[2],
  ) => {
    const dir = artifactDir ?? 'proof';
    const screenshotPath = join(dir, `${config.id}-rehearsal-${Date.now()}.png`);
    await report.step('screenshot filled composer', async () => {
      await mkdir(dir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    });
    await report.step('discard draft', async () => {
      await page.keyboard.press('Escape');
      const confirm = first(page, config.discard ?? DEFAULT_DISCARD);
      if (await confirm.count().catch(() => 0)) await interactions.click(confirm);
      // Leave the composer page entirely so nothing half-filled stays open in the profile.
      await page.goto('about:blank').catch(() => undefined);
    });
    return { submitted: false, signal: 'rehearsal', screenshotPath };
  };
  const identify = async (page: Page): Promise<AccountIdentity | null> => {
    const fromUrl = identityFromPath(config.id, new URL(page.url()).pathname);
    if (config.id === 'youtube' && fromUrl) return fromUrl;
    if (!config.identity?.length) return null;
    const link = first(page, config.identity);
    await link.waitFor({ state: 'attached', timeout: 8_000 }).catch(() => undefined);
    const href = (await link.count()) ? await link.getAttribute('href') : null;
    if (!href) return null;
    const url = new URL(href, page.url());
    return identityFromPath(config.id, url.pathname, url.search);
  };
  return {
    id: config.id,
    capabilities: capabilities[config.id],
    validate,
    identify,
    async checkSession(ctx) {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(config.home, { waitUntil: 'domcontentloaded' });
      await settle(page, [...config.selectors.loggedIn, ...config.selectors.challenged]);
      if (await first(page, config.selectors.challenged).count()) return 'challenged';
      return (await first(page, config.selectors.loggedIn).count()) ? 'ok' : 'logged_out';
    },
    async publish(ctx, post, report, options = {}) {
      const rehearse = options.rehearse === true;
      const errors = validate(post);
      if (errors.length) throw failure('content', 'invalid_content', errors.join('; '));
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await report.step('open composer', async () => {
        await page.goto(config.compose, { waitUntil: 'domcontentloaded' });
        await first(page, config.selectors.composer).waitFor({ state: 'visible', timeout: 30_000 });
      });
      await interactions.pause(page);
      await report.step('fill text', () => interactions.type(first(page, config.selectors.text), post.text));
      if (post.media.length)
        await report.step('upload media', () =>
          first(page, config.selectors.file).setInputFiles(post.media.map((m) => m.path)),
        );
      const addAlt = async () =>
        report.step('add media alt text', async () => {
          await interactions.click(first(page, config.altText!.open));
          const inputs = combined(page, config.altText!.input);
          const count = await inputs.count();
          for (let index = 0; index < Math.min(count, post.media.length); index++) {
            const alt = post.media[index]?.altText;
            if (alt) await inputs.nth(index).fill(alt);
          }
          await interactions.click(first(page, config.altText!.save));
        });
      const applyFields = async (afterFlow: boolean) => {
        for (const field of (config.optionFields ?? []).filter(
          (item) => Boolean(item.afterFlow) === afterFlow,
        )) {
          const value = post.options?.[field.key];
          if (value === undefined || value === '') continue;
          await report.step(`set ${field.label}`, async () => {
            const selectors =
              field.type === 'toggle' && value === false && field.falseSelectors
                ? field.falseSelectors
                : field.selectors;
            const locator = first(page, selectors);
            if (field.type === 'select') await locator.selectOption(String(value));
            else if (field.type === 'toggle') await interactions.click(locator);
            else await locator.fill(String(value));
          });
        }
      };
      const runFlow = async (stage: 'beforeOptions' | 'afterOptions') => {
        for (const step of (config.flowSteps ?? []).filter(
          (item) => (item.stage ?? 'beforeOptions') === stage,
        ))
          await report.step(step.name, () => interactions.click(first(page, step.selectors)));
      };
      const hasAlt = Boolean(config.altText && post.media.some((media) => media.altText));
      if (hasAlt && !config.altText!.afterFlow) await addAlt();
      await applyFields(false);
      await runFlow('beforeOptions');
      await applyFields(true);
      await runFlow('afterOptions');
      if (hasAlt && config.altText!.afterFlow) await addAlt();
      for (const [index, text] of (post.thread ?? []).entries())
        await report.step(`add thread post ${index + 2}`, async () => {
          await interactions.click(first(page, config.thread!.add));
          await interactions.type(combined(page, config.thread!.text).nth(index + 1), text);
        });
      await interactions.pause(page);
      if (rehearse) return rehearseEnd(page, post.artifactDir, report);
      // Below this line only runs for real publishes. Rehearsals returned above, so their submit is unreachable.
      await report.step('submit', () => interactions.click(submitButton(page, rehearse)));
      if (config.processing)
        await report.step('wait for processing', () =>
          first(page, config.selectors.success).waitFor({ state: 'visible', timeout: 300_000 }),
        );
      else
        await report.step('wait for success', () =>
          first(page, config.selectors.success).waitFor({ state: 'visible', timeout: 45_000 }),
        );
      return { submitted: true, signal: 'platform success' };
    },
    async verify(ctx, post) {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      if (post.profileUrl) {
        // The account's own profile, captured after login or set by the owner in Accounts.
        await page.goto(post.profileUrl, { waitUntil: 'domcontentloaded' });
      } else {
        await page.goto(config.profile, { waitUntil: 'domcontentloaded' });
        if (config.profileLink) {
          const profileLink = first(page, config.profileLink);
          await profileLink.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);
          const own = (await profileLink.count()) ? await profileLink.getAttribute('href') : null;
          if (own) await page.goto(new URL(own, page.url()).toString(), { waitUntil: 'domcontentloaded' });
        }
      }
      const prefix = post.text.slice(0, 40);
      const match = first(page, config.selectors.post).filter({ hasText: prefix }).first();
      for (let attempt = 0; attempt < 3; attempt++) {
        await first(page, config.selectors.post)
          .waitFor({ state: 'attached', timeout: 15_000 })
          .catch(() => undefined);
        if (await match.count()) break;
        await interactions.pause(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      const proofDir = post.artifactDir ?? 'proof';
      await mkdir(proofDir, { recursive: true });
      if (!(await match.count())) {
        const screenshotPath = join(proofDir, `${config.id}-unverified-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return { found: false, screenshotPath };
      }
      const link = match.locator((config.permalink ?? ['a[href]']).join(', ')).first();
      const href = (await link.count()) ? await link.getAttribute('href') : null;
      if (!href) {
        const screenshotPath = join(proofDir, `${config.id}-unverified-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return { found: false, screenshotPath };
      }
      if (post.firstComment && config.comment) {
        await interactions.type(first(page, config.comment.input), post.firstComment);
        await interactions.click(first(page, config.comment.submit));
      }
      const screenshotPath = join(proofDir, `${config.id}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { found: true, url: new URL(href, page.url()).toString(), screenshotPath };
    },
  };
}
