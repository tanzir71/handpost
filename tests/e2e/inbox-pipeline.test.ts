import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { BrowserEngine } from '../../src/main/engine/browser';
import { InboxService } from '../../src/main/inbox/service';
import { ensureLayout } from '../../src/main/inbox/paths';
import { Scheduler } from '../../src/main/scheduler/scheduler';
import { INBOX_PLATFORMS } from '../../src/shared/inbox-schema';
import { startMockSocial, stopMockSocial } from '../mock-social/server';

let server: Server;
let base: string;
let engine: BrowserEngine | undefined;

beforeAll(async () => {
  server = await startMockSocial();
  base = await mkdtemp(join(tmpdir(), 'handpost-inbox-e2e-'));
}, 30_000);
afterAll(async () => {
  await engine?.close();
  await stopMockSocial(server);
  await rm(base, { recursive: true, force: true });
});

describe('inbox → MockSocial → receipt', () => {
  it('publishes an inbox file through the real engine and reports it in the receipt; a repeat is a duplicate', async () => {
    const db = openDatabase();
    db.prepare(
      "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('mock','MockSocial','mock','ok')",
    ).run();
    db.prepare("INSERT INTO settings(key,value) VALUES ('inbox.autoSchedule','true')").run();
    engine = new BrowserEngine(join(base, 'profiles'), 'chromium');
    // Log in to MockSocial once, as the owner would (manual login form; Handpost never types credentials).
    const login = await engine.context('mock', { headless: true });
    const page = login.pages()[0] ?? (await login.newPage());
    await page.goto('http://127.0.0.1:4178/');
    await page.locator('[data-handpost="login"] input').fill('owner');
    await Promise.all([
      page.waitForURL('http://127.0.0.1:4178/'),
      page.locator('[data-handpost="login"] button').click(),
    ]);
    await engine.close('mock');

    const root = join(base, 'Handpost');
    ensureLayout(root);
    const inbox = new InboxService({
      db,
      root,
      mediaStore: join(base, 'media'),
      appVersion: 'e2e',
      platforms: [...INBOX_PLATFORMS, 'mock'],
      watch: false,
      settleMs: 0,
      statusDebounceMs: 10,
    });
    await inbox.start();
    const scheduler = new Scheduler(db, engine, () => {}, undefined, join(base, 'artifacts'));

    const file =
      '---\nhandpost: 1\nid: e2e-hello\nplatforms: [mock]\nwhen: now\nsource: claude:e2e\n---\nHello from the Handpost inbox\n';
    await writeFile(join(root, 'inbox', 'hello.md'), file);
    await inbox.rescan();
    await inbox.idle();
    const receiptPath = join(root, 'receipts', 'e2e-hello.json');
    const accepted = JSON.parse(await readFile(receiptPath, 'utf8'));
    expect(accepted.state).toBe('scheduled');

    // Fire the scheduler as if the (jittered) time had come.
    await scheduler.tick(new Date(Date.now() + 5 * 60_000));
    await scheduler.idle();
    await expect
      .poll(async () => JSON.parse(await readFile(receiptPath, 'utf8')).state, { timeout: 10_000 })
      .toBe('published');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    expect(receipt.targets[0]).toMatchObject({
      platform: 'mock',
      status: 'published',
      url: 'http://127.0.0.1:4178/posts/1',
    });
    expect(receipt.targets[0].published_at).toMatch(/Z$/);

    // The same file again (e.g. the writer's task ran twice): duplicate, nothing new is posted.
    await mkdir(join(root, 'inbox', 'again'), { recursive: true });
    await writeFile(join(root, 'inbox', 'again', 'hello.md'), file);
    await inbox.rescan();
    await inbox.idle();
    expect(
      db
        .prepare("SELECT outcome FROM inbox_files WHERE file_name='hello.md' ORDER BY id DESC LIMIT 1")
        .pluck()
        .get(),
    ).toBe('duplicate');
    expect(db.prepare('SELECT count(*) FROM posts').pluck().get()).toBe(1);
    await scheduler.tick(new Date(Date.now() + 10 * 60_000));
    await scheduler.idle();
    const profile = await (
      await fetch('http://127.0.0.1:4178/profile', { headers: { cookie: 'mock_session=ok' } })
    ).text();
    expect(profile.match(/data-handpost="post"/g)).toHaveLength(1);
    expect(JSON.parse(await readFile(receiptPath, 'utf8')).state).toBe('published');

    await inbox.stop();
    engine = undefined;
    db.close();
  }, 90_000);
});
