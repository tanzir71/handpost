import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import {
  detectBrowser,
  isBrowserMissingError,
  readBrowserVersion,
  type DetectDeps,
} from '../../src/main/engine/browser-detect';
import { Scheduler } from '../../src/main/scheduler/scheduler';
import { rehearsalPng, rehearsalPost } from '../../src/main/accounts/rehearsal';
import { capabilities } from '../../src/shared/capabilities';
import type { PlatformId } from '../../src/shared/types';

function deps(overrides: Partial<DetectDeps>): DetectDeps {
  return {
    exists: () => false,
    readDir: () => [],
    readText: () => '',
    run: () => '',
    env: { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    platform: 'win32',
    ...overrides,
  };
}

describe('browser detection', () => {
  it('finds Chrome on Windows and reads the newest version folder beside chrome.exe', () => {
    const info = detectBrowser(
      'chrome',
      deps({
        exists: (path) => path.startsWith('C:\\Program Files') && path.endsWith('chrome.exe'),
        readDir: () => ['130.0.6723.117', 'chrome.exe', '131.0.6778.86', 'SetupMetrics', '131.0.6778.9'],
      }),
    );
    expect(info).toMatchObject({
      channel: 'chrome',
      found: true,
      version: '131.0.6778.86',
      label: 'Google Chrome',
    });
    expect(info.path).toContain('chrome.exe');
  });
  it('reads the macOS version from Info.plist and the Linux one from --version', () => {
    const plist = '<dict><key>CFBundleShortVersionString</key>\n<string>131.0.6778.86</string></dict>';
    expect(
      readBrowserVersion(
        '/Applications/Google Chrome.app',
        deps({ platform: 'darwin', readText: () => plist }),
      ),
    ).toBe('131.0.6778.86');
    expect(
      readBrowserVersion(
        '/usr/bin/google-chrome',
        deps({ platform: 'linux', run: () => 'Google Chrome 131.0.6778.85 \n' }),
      ),
    ).toBe('131.0.6778.85');
  });
  it('reports a missing browser instead of throwing', () => {
    expect(detectBrowser('chrome', deps({}))).toMatchObject({ found: false, path: null, version: null });
    expect(
      detectBrowser(
        'msedge',
        deps({
          readDir: () => {
            throw new Error('EACCES');
          },
        }),
      ),
    ).toMatchObject({ found: false });
  });
  it('recognizes Playwright errors for an uninstalled channel', () => {
    expect(
      isBrowserMissingError(
        new Error(
          "browserType.launchPersistentContext: Chromium distribution 'chrome' is not found at C:\\x",
        ),
      ),
    ).toBe(true);
    expect(isBrowserMissingError(new Error("Executable doesn't exist at /ms-playwright/chromium"))).toBe(
      true,
    );
    expect(isBrowserMissingError(new Error('Timeout 30000ms exceeded'))).toBe(false);
  });
});

function setup(platform: PlatformId = 'x') {
  const db = openDatabase();
  db.prepare(
    "INSERT INTO accounts(platform,display_name,profile_dir,status,profile_url) VALUES (?,?,?,'ok',?)",
  ).run(platform, platform, platform, 'https://x.com/tanzir');
  return db;
}
function fakeEngine() {
  const page = {} as never;
  const ctx = { pages: () => [page], newPage: async () => page } as never;
  return { context: vi.fn(async () => ctx), close: vi.fn(async () => {}) } as never as ConstructorParameters<
    typeof Scheduler
  >[1];
}
function fakeAdapter(platform: PlatformId = 'x') {
  return {
    id: platform,
    capabilities: capabilities[platform],
    validate: vi.fn(() => [] as string[]),
    checkSession: vi.fn(async () => 'ok' as const),
    publish: vi.fn(
      async (_ctx: unknown, _post: unknown, _report: unknown, options?: { rehearse?: boolean }) =>
        options?.rehearse
          ? { submitted: false, signal: 'rehearsal', screenshotPath: 'shot.png' }
          : { submitted: true },
    ),
    verify: vi.fn(async (_ctx: unknown, post: { profileUrl?: string | null }) => ({
      found: true,
      url: `${post.profileUrl}/status/1`,
      screenshotPath: 'proof.png',
    })),
  };
}

describe('scheduler live readiness', () => {
  it('marks targets needs_attention: chrome_missing when no browser is installed, without launching', async () => {
    const db = setup();
    db.prepare("INSERT INTO posts(base_text,status) VALUES ('hello','scheduled')").run();
    db.prepare(
      "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','scheduled')",
    ).run();
    const engine = fakeEngine();
    const notify = vi.fn();
    const scheduler = new Scheduler(db, engine, notify, () => fakeAdapter() as never, 'artifacts', {
      browserReady: () => false,
    });
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(db.prepare('SELECT status,error_code FROM post_targets').get()).toEqual({
      status: 'needs_attention',
      error_code: 'chrome_missing',
    });
    expect((engine as unknown as { context: ReturnType<typeof vi.fn> }).context).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Handpost needs Google Chrome', expect.any(String));
  });
  it('treats a launch error for a missing channel the same way', async () => {
    const db = setup();
    db.prepare("INSERT INTO posts(base_text,status) VALUES ('hello','scheduled')").run();
    db.prepare(
      "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','scheduled')",
    ).run();
    const engine = {
      context: vi.fn(async () => {
        throw new Error("Chromium distribution 'chrome' is not found at C:\\Program Files\\Google");
      }),
      close: vi.fn(async () => {}),
    } as never;
    const scheduler = new Scheduler(
      db,
      engine,
      () => {},
      () => fakeAdapter() as never,
      'artifacts',
    );
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(db.prepare('SELECT error_code FROM post_targets').pluck().get()).toBe('chrome_missing');
    expect(db.prepare('SELECT count(*) FROM publish_attempts').pluck().get()).toBe(0);
  });
  it('verifies against the stored profile URL', async () => {
    const db = setup();
    db.prepare("INSERT INTO posts(base_text,status) VALUES ('hello','scheduled')").run();
    db.prepare(
      "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','scheduled')",
    ).run();
    const adapter = fakeAdapter();
    const scheduler = new Scheduler(
      db,
      fakeEngine(),
      () => {},
      () => adapter as never,
      'artifacts',
    );
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(adapter.verify.mock.calls[0]![1]).toMatchObject({ profileUrl: 'https://x.com/tanzir' });
    expect(db.prepare('SELECT published_url FROM post_targets').pluck().get()).toBe(
      'https://x.com/tanzir/status/1',
    );
  });
  it('rehearses through the adapter with rehearse: true and records a hidden rehearsal attempt', async () => {
    const db = setup();
    const adapter = fakeAdapter();
    const scheduler = new Scheduler(
      db,
      fakeEngine(),
      () => {},
      () => adapter as never,
      'artifacts',
    );
    const result = await scheduler.rehearse('x', { text: 'Rehearsal', media: [], options: {} });
    expect(result).toMatchObject({ outcome: 'rehearsal', screenshotPath: 'shot.png', error: null });
    expect(adapter.publish.mock.calls[0]![3]).toEqual({ rehearse: true });
    expect(adapter.verify).not.toHaveBeenCalled();
    expect(db.prepare('SELECT status FROM posts').pluck().get()).toBe('rehearsal');
    expect(db.prepare('SELECT status FROM post_targets').pluck().get()).toBe('rehearsal');
    expect(db.prepare('SELECT outcome FROM publish_attempts').pluck().get()).toBe('rehearsal');
    // A rehearsal never becomes due.
    await scheduler.tick(new Date('2030-01-01T00:00:00Z'));
    await scheduler.idle();
    expect(adapter.publish).toHaveBeenCalledTimes(1);
  });
});

describe('rehearsal posts', () => {
  it('generate a valid PNG for image platforms and ask for a video on video platforms', async () => {
    const png = rehearsalPng(16);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    const db = openDatabase();
    const dir = (await import('node:os')).tmpdir();
    const instagram = await rehearsalPost(db, 'instagram', dir, async () => null);
    expect(instagram?.media[0]).toMatchObject({ kind: 'image' });
    expect(await rehearsalPost(db, 'tiktok', dir, async () => null)).toBeNull();
    const youtube = await rehearsalPost(db, 'youtube', dir, async () => 'clip.mp4');
    expect(youtube).toMatchObject({
      media: [{ path: 'clip.mp4', kind: 'video' }],
      options: { visibility: 'private' },
    });
  });
});
