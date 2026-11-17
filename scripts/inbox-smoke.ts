/**
 * `npm run inbox:smoke` — a dry run of the folder protocol with nothing real attached.
 *
 * Creates a temporary Handpost folder and database, copies examples/inbox/* into inbox/ plus one post for
 * MockSocial, runs the inbox service once, publishes the MockSocial post through the real engine against the
 * local MockSocial server (headless Chromium), and prints every receipt. The real platforms in the examples are
 * left "not connected", so their posts are accepted with warnings and never published.
 *
 *   npm run inbox:smoke             # keeps nothing; prints receipts
 *   npm run inbox:smoke -- --keep   # leaves the temp folder for inspection
 */
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/main/db/database';
import { BrowserEngine } from '../src/main/engine/browser';
import { InboxService } from '../src/main/inbox/service';
import { ensureLayout } from '../src/main/inbox/paths';
import { Scheduler } from '../src/main/scheduler/scheduler';
import { INBOX_PLATFORMS } from '../src/shared/inbox-schema';
import { PLATFORM_IDS } from '../src/shared/types';
import { startMockSocial, stopMockSocial } from '../tests/mock-social/server';

const keep = process.argv.includes('--keep');
const base = await mkdtemp(join(tmpdir(), 'handpost-smoke-'));
const root = join(base, 'Handpost');
const layout = ensureLayout(root);
const db = openDatabase(join(base, 'handpost.db'));
for (const platform of PLATFORM_IDS)
  db.prepare('INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES (?,?,?,?)').run(
    platform,
    platform === 'mock' ? 'MockSocial' : platform,
    join(base, 'profiles', platform),
    platform === 'mock' ? 'ok' : 'unknown',
  );
db.prepare("INSERT INTO settings(key,value) VALUES ('inbox.autoSchedule','true')").run();

// The protocol examples, in order (post, batch, then the cancel that targets the first post).
const examples = join(process.cwd(), 'examples', 'inbox');
for (const name of (await readdir(examples)).sort((a) => (a.startsWith('cancel') ? 1 : -1)))
  await copyFile(join(examples, name), join(layout.inbox, name));
await writeFile(
  join(layout.inbox, 'smoke-mock.md'),
  '---\nhandpost: 1\nid: smoke-mock-hello\nplatforms: [mock]\nwhen: now\nsource: manual:smoke\n---\nHello from the Handpost inbox smoke test\n',
);

const server = await startMockSocial();
const engine = new BrowserEngine(join(base, 'profiles'), 'chromium');
try {
  // Log in to MockSocial once, the way an owner would (a form on the local mock site).
  const login = await engine.context('mock', { headless: true });
  const page = login.pages()[0] ?? (await login.newPage());
  await page.goto('http://127.0.0.1:4178/');
  await page.locator('[data-handpost="login"] input').fill('owner');
  await Promise.all([
    page.waitForURL('http://127.0.0.1:4178/'),
    page.locator('[data-handpost="login"] button').click(),
  ]);
  await engine.close('mock');

  const inbox = new InboxService({
    db,
    root,
    mediaStore: join(base, 'media'),
    appVersion: 'smoke',
    platforms: [...INBOX_PLATFORMS, 'mock'],
    watch: false,
    settleMs: 0,
    statusDebounceMs: 10,
  });
  await inbox.start();
  await inbox.rescan();
  await inbox.idle();
  const scheduler = new Scheduler(db, engine, () => {}, undefined, join(base, 'artifacts'));
  await scheduler.tick(new Date(Date.now() + 5 * 60_000));
  await scheduler.idle();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await inbox.idle();
  await inbox.writeStatusNow();
  await inbox.stop();

  console.log(`Handpost folder: ${root}\n`);
  for (const name of (await readdir(layout.receipts)).sort()) {
    const receipt = JSON.parse(await readFile(join(layout.receipts, name), 'utf8'));
    const targets = receipt.targets
      .map(
        (t: { platform: string; status: string; url: string | null }) =>
          `${t.platform}=${t.status}${t.url ? ` ${t.url}` : ''}`,
      )
      .join(', ');
    const warnings = receipt.warnings.map(
      (w: { code: string; platform?: string }) => `${w.code}${w.platform ? `(${w.platform})` : ''}`,
    );
    console.log(
      `receipts/${name}\n  state: ${receipt.state}\n  targets: ${targets || '—'}\n  warnings: ${warnings.join(', ') || '—'}`,
    );
  }
  const left = await readdir(layout.inbox);
  console.log(`\ninbox/ now holds: ${left.filter((name) => !name.startsWith('.')).join(', ') || 'nothing'}`);
  const mock = JSON.parse(await readFile(join(layout.receipts, 'smoke-mock-hello.json'), 'utf8'));
  if (mock.state !== 'published') throw new Error(`MockSocial post ended ${mock.state}`);
  console.log('Inbox smoke passed: examples accepted, MockSocial post published with a receipt.');
} finally {
  await engine.close().catch(() => undefined);
  await stopMockSocial(server);
  db.close();
  if (!keep) await rm(base, { recursive: true, force: true });
  else console.log(`Kept ${base}`);
}
