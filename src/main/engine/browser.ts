import { chromium, type BrowserContext } from 'playwright';
import { existsSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlatformId } from '../../shared/types';

interface ManagedContext {
  context: BrowserContext;
  background: boolean;
  headless: boolean;
}
interface ContextOptions {
  headless?: boolean;
  background?: boolean;
}

export class BrowserEngine {
  private contexts = new Map<PlatformId, ManagedContext>();
  /** One launch/close at a time per platform: two persistent contexts on one profile would not share a session. */
  private locks = new Map<PlatformId, Promise<unknown>>();
  constructor(
    private readonly profilesRoot: string,
    private readonly browserChannel: BrowserChannel = 'chrome',
  ) {}
  get channel(): BrowserChannel {
    return this.browserChannel;
  }

  private serialized<T>(platform: PlatformId, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(platform) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.locks.set(
      platform,
      next.catch(() => undefined),
    );
    return next;
  }

  context(platform: PlatformId, options: ContextOptions = {}): Promise<BrowserContext> {
    return this.serialized(platform, () => this.openContext(platform, options));
  }

  private async openContext(
    platform: PlatformId,
    { headless = false, background = false }: ContextOptions,
  ): Promise<BrowserContext> {
    const current = this.contexts.get(platform);
    if (current && !(current.headless && !headless) && !(current.background && !background))
      return current.context;
    if (current) await this.closeOne(platform);
    const profile = join(this.profilesRoot, platform);
    await mkdir(profile, { recursive: true });
    await chmod(profile, 0o700).catch(() => undefined);
    const args = [
      '--disable-blink-features=AutomationControlled',
      ...(background && !headless ? ['--window-position=-32000,-32000'] : []),
    ];
    const context = await chromium.launchPersistentContext(profile, {
      ...(this.browserChannel === 'chromium' ? {} : { channel: this.browserChannel }),
      headless,
      viewport: { width: 1280, height: 900 },
      args,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    this.contexts.set(platform, { context, background, headless });
    // Only forget *this* context: a late close event must not drop a newer context for the same platform.
    context.on('close', () => {
      if (this.contexts.get(platform)?.context === context) this.contexts.delete(platform);
    });
    return context;
  }

  private async closeOne(platform: PlatformId): Promise<void> {
    const entry = this.contexts.get(platform);
    if (!entry) return;
    await entry.context.close();
    if (this.contexts.get(platform) === entry) this.contexts.delete(platform);
  }

  async close(platform?: PlatformId): Promise<void> {
    if (platform) return this.serialized(platform, () => this.closeOne(platform));
    await Promise.all([...this.contexts.values()].map((entry) => entry.context.close()));
    this.contexts.clear();
  }

  activeContextCount(): number {
    return this.contexts.size;
  }

  async fingerprint(
    platform: PlatformId,
    { headless = false }: { headless?: boolean } = {},
  ): Promise<{ webdriver: boolean; cdpLeak: boolean }> {
    const context = await this.context(platform, { headless });
    const page = await context.newPage();
    await page.goto('data:text/html,<title>Handpost fingerprint</title>');
    const result = await page.evaluate(() => ({
      webdriver: Boolean(navigator.webdriver),
      cdpLeak: ['cdc_adoQpoasnfa76pfcZLmcfl_Array', '__playwright__binding__'].some((key) => key in window),
    }));
    await page.close();
    return result;
  }
}

export type BrowserChannel = 'chrome' | 'msedge' | 'chromium';

/** Where an installed Google Chrome / Microsoft Edge lives, i.e. what Playwright's `chrome` and `msedge` channels launch. */
export function browserCandidates(
  channel: 'chrome' | 'msedge',
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter(
      (root): root is string => Boolean(root),
    );
    const relative =
      channel === 'chrome'
        ? ['Google', 'Chrome', 'Application', 'chrome.exe']
        : ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
    return roots.map((root) => join(root, ...relative));
  }
  if (platform === 'darwin')
    return [channel === 'chrome' ? '/Applications/Google Chrome.app' : '/Applications/Microsoft Edge.app'];
  return channel === 'chrome'
    ? ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    : ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
}

/**
 * Picks the real browser Handpost drives. An explicit choice (HANDPOST_BROWSER = chrome | msedge | chromium) wins;
 * otherwise installed Google Chrome, then Microsoft Edge (present on every Windows install). Handpost always uses its
 * own profile directory per platform — never the person's everyday browser profile.
 */
export function resolveBrowserChannel(
  requested?: string,
  exists: (path: string) => boolean = existsSync,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): BrowserChannel {
  if (requested === 'chrome' || requested === 'msedge' || requested === 'chromium') return requested;
  for (const channel of ['chrome', 'msedge'] as const)
    if (browserCandidates(channel, env, platform).some((path) => exists(path))) return channel;
  return 'chrome';
}
