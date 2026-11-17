import type { Page } from 'playwright';
import type { PlatformId } from '../../shared/types';
import type { HandpostDatabase } from '../db/database';
import type { BrowserEngine } from '../engine/browser';
import { adapterConfigs } from '../adapters/configs';
import { getAdapter } from '../adapters';

interface ConnectOptions {
  pollMs?: number;
  headless?: boolean;
}
export async function connectAccount(
  db: HandpostDatabase,
  engine: BrowserEngine,
  platform: PlatformId,
  { pollMs = 2_000, headless = false }: ConnectOptions = {},
): Promise<void> {
  const config = adapterConfigs.find((candidate) => candidate.id === platform);
  if (!config) throw new Error('Platform not configured');
  const context = await engine.context(platform, { headless });
  const page = context.pages()[0] ?? (await context.newPage());
  db.prepare(
    "UPDATE accounts SET status='needs_login',last_checked_at=CURRENT_TIMESTAMP WHERE platform=?",
  ).run(platform);
  await page.goto(config.home);
  let resolved = false;
  let checking = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const persist = (status: string) =>
    db
      .prepare('UPDATE accounts SET status=?,last_checked_at=CURRENT_TIMESTAMP WHERE platform=?')
      .run(status, platform);
  const inspect = async () => {
    if (resolved || checking || page.isClosed()) return;
    checking = true;
    try {
      if (await matchesAny(page, config.selectors.challenged)) {
        resolved = true;
        if (timer) clearInterval(timer);
        persist('challenged');
        return;
      }
      if (await matchesAny(page, config.selectors.loggedIn)) {
        resolved = true;
        if (timer) clearInterval(timer);
        persist('ok');
        await engine.close(platform);
      }
    } finally {
      checking = false;
    }
  };
  page.once('close', () => {
    if (timer) clearInterval(timer);
    if (resolved) return;
    resolved = true;
    void (async () => {
      const status = await getAdapter(platform)
        .checkSession(context)
        .catch(() => 'logged_out' as const);
      persist(status === 'ok' ? 'ok' : status === 'challenged' ? 'challenged' : 'needs_login');
      await engine.close(platform).catch(() => undefined);
    })();
  });
  await inspect();
  if (!resolved) {
    timer = setInterval(() => void inspect(), pollMs);
    timer.unref?.();
  }
}

async function matchesAny(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      if (await page.locator(selector).first().count()) return true;
    } catch {
      continue;
    }
  }
  return false;
}
