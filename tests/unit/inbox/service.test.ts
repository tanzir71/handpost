import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite } from '../../../src/main/inbox/fsx';
import { createHarness, JPEG, md, MP4, PNG, type Harness } from './helpers';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const load = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'));
const validateReceipt = ajv.compile(load('schema/handpost-receipt.v1.schema.json'));
const validateStatus = ajv.compile(load('schema/handpost-status.v1.schema.json'));

let h: Harness;
afterEach(async () => {
  await h?.cleanup();
});

const errorFile = (name: string) =>
  JSON.parse(readFileSync(join(h.root, 'rejected', `${name}.error.json`), 'utf8'));

describe('inbox discovery', () => {
  it('picks up .md, .markdown and .json and leaves ignored files alone', async () => {
    h = createHarness();
    h.drop('a.md', md('id: a\nplatforms: [x]'));
    h.drop('b.markdown', md('id: b\nplatforms: [x]'));
    h.drop('c.json', JSON.stringify({ handpost: 1, id: 'c', platforms: ['x'], text: 'c' }));
    for (const ignored of ['d.md.tmp', 'e.part', '.f.md', '~$g.md', '.tmp/h.md', 'README.md', 'notes.txt'])
      h.drop(ignored, md(`id: ignored\nplatforms: [x]`));
    await h.run();
    expect(h.count('SELECT count(*) FROM posts')).toBe(3);
    expect(h.inboxFiles()).toEqual(['.f.md', 'README.md', 'd.md.tmp', 'e.part', 'notes.txt', '~$g.md']);
    expect(h.processedFiles()).toEqual(['2026-11/a.md', '2026-11/b.markdown', '2026-11/c.json']);
  });
  it('waits until a growing file has been stable for the settle time', async () => {
    h = createHarness({ settleMs: 250 });
    const path = h.drop('grow.md', md('id: grow\nplatforms: [x]', 'part one'));
    await h.run();
    expect(h.inboxFiles()).toEqual(['grow.md']);
    appendFileSync(path, 'more text\n');
    await h.run();
    expect(h.inboxFiles()).toEqual(['grow.md']);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await h.run();
    expect(h.inboxFiles()).toEqual([]);
    expect(h.receipt('grow').state).toBe('scheduled');
  });
  it('finds files the watcher missed on rescan', async () => {
    h = createHarness({ watch: false });
    h.drop('nested/deep/late.md', md('id: late\nplatforms: [bluesky]'));
    await h.run();
    expect(h.receipt('late').state).toBe('scheduled');
  });
});

describe('inbox content checks', () => {
  it('rejects an X post over 280 weighted characters, naming x', async () => {
    h = createHarness();
    h.drop('long.md', md('id: long\nplatforms: [x, linkedin]', 'a'.repeat(281)));
    await h.run();
    const receipt = h.receipt('long');
    expect(receipt.state).toBe('rejected');
    expect(receipt.errors).toEqual([expect.objectContaining({ code: 'content_invalid', platform: 'x' })]);
    expect(h.count('SELECT count(*) FROM posts')).toBe(0);
    expect(errorFile('long.md').errors[0].code).toBe('content_invalid');
  });
  it('warns text_folds for LinkedIn text past the fold', async () => {
    h = createHarness();
    h.drop('fold.md', md('id: fold\nplatforms: [linkedin]', 'word '.repeat(60)));
    await h.run();
    expect(h.receipt('fold').warnings).toContainEqual(
      expect.objectContaining({ code: 'text_folds', platform: 'linkedin' }),
    );
  });
  it('maps an X thread to options.threadParts and first comments to the target', async () => {
    h = createHarness();
    h.drop(
      'thread.json',
      JSON.stringify({
        handpost: 1,
        id: 'thread',
        platforms: ['x'],
        text: 'first',
        overrides: { x: { thread: ['second', 'third'], first_comment: 'more' } },
      }),
    );
    await h.run();
    const target = h.db.prepare('SELECT options_json,first_comment FROM post_targets').get() as {
      options_json: string;
      first_comment: string;
    };
    expect(JSON.parse(target.options_json)).toEqual({ threadParts: JSON.stringify(['second', 'third']) });
    expect(target.first_comment).toBe('more');
  });
  it('rejects Facebook without page_name and TikTok without a video', async () => {
    h = createHarness();
    h.drop('fb.md', md('id: fb\nplatforms: [facebook]'));
    h.drop('tt.md', md('id: tt\nplatforms: [tiktok]'));
    h.drop(
      'fb-ok.md',
      md(
        'id: fb-ok\nplatforms: [facebook]\noverrides:\n  facebook:\n    options:\n      page_name: Handpost',
      ),
    );
    await h.run();
    expect(h.receipt('fb').errors[0]).toEqual(
      expect.objectContaining({ code: 'content_invalid', platform: 'facebook' }),
    );
    expect(h.receipt('tt').errors[0]).toEqual(
      expect.objectContaining({ code: 'content_invalid', platform: 'tiktok' }),
    );
    expect(h.receipt('fb-ok').state).toBe('scheduled');
    const options = h.db.prepare('SELECT options_json FROM post_targets').pluck().get() as string;
    expect(JSON.parse(options)).toEqual({ pageName: 'Handpost' });
  });
});

describe('inbox media', () => {
  it('accepts relative media, copies it into the store and moves it to processed', async () => {
    h = createHarness();
    h.drop('media/tip.png', PNG);
    h.drop('post.md', md('id: pic\nplatforms: [x]\nmedia:\n  - path: media/tip.png\n    alt: A tip'));
    await h.run();
    expect(h.receipt('pic').state).toBe('scheduled');
    const media = h.db.prepare('SELECT path,kind,alt_text FROM media').get() as {
      path: string;
      kind: string;
      alt_text: string;
    };
    expect(media.kind).toBe('image');
    expect(media.alt_text).toBe('A tip');
    expect(media.path.startsWith(join(h.dataDir, 'media'))).toBe(true);
    expect(existsSync(media.path)).toBe(true);
    expect(h.processedFiles()).toEqual(['2026-11/media/tip.png', '2026-11/post.md']);
  });
  it('rejects paths and symlinks that escape the inbox as media_outside_root', async () => {
    h = createHarness();
    const outside = mkdtempSync(join(tmpdir(), 'handpost-outside-'));
    writeFileSync(join(outside, 'secret.png'), PNG);
    h.drop('escape.md', md('id: escape\nplatforms: [x]\nmedia:\n  - path: ../../secret.png'));
    symlinkSync(outside, join(h.root, 'inbox', 'link'), 'junction');
    h.drop('linked.md', md('id: linked\nplatforms: [x]\nmedia:\n  - path: link/secret.png'));
    await h.run();
    expect(h.receipt('escape').errors[0]).toEqual(
      expect.objectContaining({ code: 'media_outside_root', path: '/media/0/path' }),
    );
    expect(h.receipt('linked').errors[0]).toEqual(expect.objectContaining({ code: 'media_outside_root' }));
    expect(h.count('SELECT count(*) FROM posts')).toBe(0);
  });
  it('waits for missing media, then rejects media_missing after 10 minutes', async () => {
    h = createHarness();
    h.drop('wait.md', md('id: wait\nplatforms: [x]\nmedia:\n  - path: media/later.png'));
    await h.run();
    expect(h.receipt('wait').state).toBe('waiting_media');
    expect(h.inboxFiles()).toEqual(['wait.md']);
    h.clock.now = new Date(h.clock.now.getTime() + 9 * 60_000);
    await h.run();
    expect(h.receipt('wait').state).toBe('waiting_media');
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 60_000);
    await h.run();
    expect(h.receipt('wait').state).toBe('rejected');
    expect(h.receipt('wait').errors[0]).toEqual(expect.objectContaining({ code: 'media_missing' }));
    expect(h.rejectedFiles()).toEqual(['wait.md', 'wait.md.error.json']);
  });
  it('accepts media that arrives while waiting', async () => {
    h = createHarness();
    h.drop('arrive.md', md('id: arrive\nplatforms: [x]\nmedia:\n  - path: media/a.jpg'));
    await h.run();
    expect(h.receipt('arrive').state).toBe('waiting_media');
    h.drop('media/a.jpg', JPEG);
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await h.run();
    expect(h.receipt('arrive').state).toBe('scheduled');
  });
  it('rejects a file whose bytes do not match its extension as media_unsupported', async () => {
    h = createHarness();
    h.drop('media/fake.png', JPEG);
    h.drop('fake.md', md('id: fake\nplatforms: [x]\nmedia:\n  - path: media/fake.png'));
    await h.run();
    expect(h.receipt('fake').errors[0]).toEqual(expect.objectContaining({ code: 'media_unsupported' }));
  });
  it('does not move shared media while another unprocessed file still references it', async () => {
    h = createHarness();
    h.drop('media/shared.png', PNG);
    h.drop('one.md', md('id: one\nplatforms: [x]\nmedia:\n  - path: media/shared.png'));
    h.drop(
      'two.md',
      md('id: two\nplatforms: [x]\nmedia:\n  - path: media/later.png\n  - path: media/shared.png'),
    );
    await h.run();
    expect(h.receipt('one').state).toBe('scheduled');
    expect(h.receipt('two').state).toBe('waiting_media');
    expect(h.inboxFiles()).toEqual(['media/shared.png', 'two.md']);
  });
  it('normalizes backslash media paths (Windows writers)', async () => {
    h = createHarness();
    h.drop('media/clip.mp4', MP4);
    h.drop(
      'clip.json',
      JSON.stringify({
        handpost: 1,
        id: 'clip',
        platforms: ['x'],
        text: 'v',
        media: [{ path: 'media\\clip.mp4' }],
      }),
    );
    await h.run();
    expect(h.receipt('clip').state).toBe('scheduled');
    expect(h.db.prepare('SELECT kind FROM media').pluck().get()).toBe('video');
  });
});

describe('inbox idempotency, replace and cancel', () => {
  const post = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      handpost: 1,
      id: 'same',
      platforms: ['x', 'bluesky'],
      text: 'Original',
      when: '2026-11-20T10:00:00Z',
      ...extra,
    });
  it('treats the same id and content as a duplicate with no new rows', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    const before = h.receipt('same');
    h.drop('b.json', post({ on_conflict: 'replace' }));
    await h.run();
    expect(h.count('SELECT count(*) FROM posts')).toBe(1);
    expect(h.count('SELECT count(*) FROM post_targets')).toBe(2);
    expect(h.receipt('same')).toEqual(before);
    expect(h.processedFiles()).toEqual(['2026-11/a.json', '2026-11/b.json']);
    expect(h.count("SELECT count(*) FROM inbox_files WHERE outcome='duplicate'")).toBe(1);
  });
  it('rejects different content under an existing id with duplicate_id by default', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    h.drop('b.json', post({ text: 'Changed' }));
    await h.run();
    expect(errorFile('b.json').errors[0].code).toBe('duplicate_id');
    expect(h.receipt('same').state).toBe('scheduled');
    expect(h.db.prepare('SELECT base_text FROM posts').pluck().get()).toBe('Original');
  });
  it('replaces content and targets before publishing with on_conflict: replace', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    h.drop(
      'b.json',
      post({
        text: 'Changed',
        platforms: ['linkedin'],
        when: '2026-11-21T10:00:00Z',
        on_conflict: 'replace',
      }),
    );
    await h.run();
    expect(h.count('SELECT count(*) FROM posts')).toBe(1);
    expect(h.db.prepare('SELECT base_text FROM posts').pluck().get()).toBe('Changed');
    const receipt = h.receipt('same');
    expect(receipt.targets).toEqual([
      expect.objectContaining({ platform: 'linkedin', scheduled_at: '2026-11-21T10:00:00Z' }),
    ]);
    expect(receipt.replaced_at).toBeTruthy();
  });
  it('refuses to replace once a target is publishing or published', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    h.db
      .prepare(
        "UPDATE post_targets SET status='published',published_url='https://x.com/a/status/1' WHERE id=1",
      )
      .run();
    h.drop('b.json', post({ text: 'Changed', on_conflict: 'replace' }));
    await h.run();
    expect(errorFile('b.json').errors[0].code).toBe('already_publishing');
  });
  it('cancels a scheduled post', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    h.drop('cancel.json', JSON.stringify({ handpost: 1, id: 'same', action: 'cancel' }));
    await h.run();
    const receipt = h.receipt('same');
    expect(receipt.state).toBe('cancelled');
    expect(receipt.targets.map((target) => target.status)).toEqual(['cancelled', 'cancelled']);
    expect(h.db.prepare('SELECT status FROM posts').pluck().get()).toBe('cancelled');
  });
  it('keeps partial with partially_published when cancelling after one platform published', async () => {
    h = createHarness();
    h.drop('a.json', post());
    await h.run();
    h.db.prepare("UPDATE post_targets SET status='published' WHERE id=1").run();
    h.drop('cancel.json', JSON.stringify({ handpost: 1, id: 'same', action: 'cancel' }));
    await h.run();
    const receipt = h.receipt('same');
    expect(receipt.state).toBe('partial');
    expect(receipt.warnings).toContainEqual(expect.objectContaining({ code: 'partially_published' }));
  });
  it('rejects cancelling an unknown id with unknown_id', async () => {
    h = createHarness();
    h.drop('cancel.json', JSON.stringify({ handpost: 1, id: 'nope', action: 'cancel' }));
    await h.run();
    expect(errorFile('cancel.json').errors[0].code).toBe('unknown_id');
  });
});

describe('inbox modes', () => {
  it('schedules when Auto-schedule is on', async () => {
    h = createHarness();
    h.drop('a.md', md('id: auto\nplatforms: [x]'));
    await h.run();
    expect(h.receipt('auto').state).toBe('scheduled');
    expect(h.db.prepare('SELECT status FROM post_targets').pluck().get()).toBe('scheduled');
  });
  it('holds everything while Auto-schedule is off, and approve schedules it', async () => {
    h = createHarness({ autoSchedule: false });
    h.drop('a.md', md('id: held\nplatforms: [x]\nwhen: "2026-11-18T05:00:00Z"'));
    await h.run();
    expect(h.receipt('held').state).toBe('held');
    const target = h.db
      .prepare('SELECT status,scheduled_at_utc,jittered_at_utc FROM post_targets')
      .get() as Record<string, string | null>;
    expect(target).toEqual({
      status: 'draft',
      scheduled_at_utc: '2026-11-18T05:00:00.000Z',
      jittered_at_utc: expect.any(String),
    });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(h.notices.map((notice) => notice.title)).toContain('1 post waiting for review');
    const receipt = await h.service.approve('held');
    expect(receipt?.state).toBe('scheduled');
    const jittered = new Date(String(h.db.prepare('SELECT jittered_at_utc FROM post_targets').pluck().get()));
    expect(Math.abs(jittered.getTime() - Date.parse('2026-11-18T05:00:00Z'))).toBeLessThanOrEqual(90_000);
  });
  it('holds mode: review even with Auto-schedule on, and reject cancels it', async () => {
    h = createHarness();
    h.drop('a.md', md('id: review\nplatforms: [x]\nmode: review'));
    await h.run();
    expect(h.receipt('review').state).toBe('held');
    const receipt = await h.service.reject('review');
    expect(receipt?.state).toBe('rejected');
    expect(h.db.prepare('SELECT status FROM post_targets').pluck().get()).toBe('cancelled');
  });
  it('creates only a draft for mode: draft', async () => {
    h = createHarness();
    h.drop('a.md', md('id: draft\nplatforms: [x, bluesky]\nmode: draft\nwhen: "2026-11-18T05:00:00Z"'));
    await h.run();
    expect(h.receipt('draft').state).toBe('draft');
    expect(h.db.prepare('SELECT status FROM posts').pluck().get()).toBe('draft');
    expect(
      h.db
        .prepare("SELECT count(*) FROM post_targets WHERE status='draft' AND scheduled_at_utc IS NULL")
        .pluck()
        .get(),
    ).toBe(2);
  });
});

describe('inbox accounts', () => {
  it('accepts posts for a platform that is not connected, with a warning', async () => {
    h = createHarness({ accountStatus: 'needs_login' });
    h.drop('a.md', md('id: nc\nplatforms: [threads]'));
    await h.run();
    expect(h.receipt('nc').state).toBe('scheduled');
    expect(h.receipt('nc').warnings).toContainEqual(
      expect.objectContaining({ code: 'platform_not_connected', platform: 'threads' }),
    );
  });
  it('accepts posts for a frozen platform, with a warning', async () => {
    h = createHarness();
    h.db.prepare("UPDATE accounts SET status='frozen' WHERE platform='instagram'").run();
    h.setting('breaker:instagram:until', '2026-11-19T08:20:00.000Z');
    h.drop('media/i.png', PNG);
    h.drop('a.md', md('id: frozen\nplatforms: [instagram]\nmedia:\n  - path: media/i.png'));
    await h.run();
    expect(h.receipt('frozen').state).toBe('scheduled');
    expect(h.receipt('frozen').warnings).toContainEqual(expect.objectContaining({ code: 'platform_frozen' }));
  });
});

describe('inbox output', () => {
  it('writes receipts and a status file that validate against the published schemas', async () => {
    h = createHarness();
    h.drop(
      'a.md',
      md('id: shape\nplatforms: [x, linkedin]\nsource: claude:weekly\nlabels: [tip]', 'Status preview text'),
    );
    h.drop('bad.json', '{ nope');
    await h.run();
    await h.service.writeStatusNow();
    const receipt = h.receipt('shape');
    expect(validateReceipt(receipt), JSON.stringify(validateReceipt.errors)).toBe(true);
    expect(receipt).toMatchObject({
      handpost: 1,
      source: 'claude:weekly',
      file: 'processed/2026-11/a.md',
      mode: 'schedule',
    });
    const synthetic = h.db
      .prepare("SELECT id FROM inbox_items WHERE id LIKE 'file-%'")
      .pluck()
      .get() as string;
    expect(synthetic).toMatch(/^file-[0-9a-f]{12}$/);
    expect(validateReceipt(h.receipt(synthetic)), JSON.stringify(validateReceipt.errors)).toBe(true);
    const status = JSON.parse(readFileSync(join(h.root, 'handpost.status.json'), 'utf8'));
    expect(validateStatus(status), JSON.stringify(validateStatus.errors)).toBe(true);
    expect(status.upcoming[0]).toMatchObject({ id: 'shape', preview: 'Status preview text' });
    expect(status.platforms.x).toMatchObject({
      connected: true,
      daily_cap: 10,
      limits: { max_chars: 280, threads: true },
    });
    expect(Date.parse(status.alive_until) - Date.parse(status.generated_at)).toBe(600_000);
  });
  it('omits previews when the setting is off', async () => {
    h = createHarness();
    h.setting('inbox.statusPreviews', 'false');
    h.drop('a.md', md('id: quiet\nplatforms: [x]'));
    await h.run();
    await h.service.writeStatusNow();
    const status = JSON.parse(readFileSync(join(h.root, 'handpost.status.json'), 'utf8'));
    expect(status.upcoming[0].id).toBe('quiet');
    expect(status.upcoming[0]).not.toHaveProperty('preview');
  });
  it('never exposes a partial file to a concurrent reader', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'handpost-atomic-'));
    const path = join(dir, 'receipt.json');
    await atomicWrite(path, JSON.stringify({ n: 0 }));
    // A reader on another thread parses the file in a tight loop while this thread keeps replacing it.
    const reader = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       const { readFileSync } = require('node:fs');
       let stop = false, reads = 0, torn = 0;
       parentPort.on('message', () => { stop = true; });
       (function loop() {
         for (let i = 0; i < 50; i++) {
           try { JSON.parse(readFileSync(workerData, 'utf8')); reads++; }
           catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EBUSY' && error.code !== 'EPERM') torn++; }
         }
         if (stop) parentPort.postMessage({ reads, torn }); else setImmediate(loop);
       })();`,
      { eval: true, workerData: path },
    );
    for (let n = 1; n <= 60; n++)
      await atomicWrite(path, JSON.stringify({ n, pad: 'x'.repeat(200_000 + n) }));
    const result = await new Promise<{ reads: number; torn: number }>((resolve) => {
      reader.once('message', resolve);
      reader.postMessage('stop');
    });
    await reader.terminate();
    expect(result.reads).toBeGreaterThan(0);
    expect(result.torn).toBe(0);
    expect(JSON.parse(readFileSync(path, 'utf8')).n).toBe(60);
    h = createHarness();
  }, 30000);
});

describe('inbox safety', () => {
  it('processes one file at a time', async () => {
    let active = 0;
    let peak = 0;
    h = createHarness({
      onProcess: (event) => {
        active += event === 'start' ? 1 : -1;
        peak = Math.max(peak, active);
      },
    });
    for (let index = 0; index < 8; index++) h.drop(`p${index}.md`, md(`id: p${index}\nplatforms: [x]`));
    await Promise.all([h.service.rescan(), h.service.rescan(), h.service.rescan()]);
    await h.service.idle();
    expect(peak).toBe(1);
    expect(h.count('SELECT count(*) FROM posts')).toBe(8);
  });
  it('creates exactly one post when the app dies between commit and file move', async () => {
    h = createHarness({
      afterCommit: () => {
        throw new Error('simulated crash after commit');
      },
    });
    const path = h.drop('crash.md', md('id: crash\nplatforms: [x]'));
    // The crash is caught by the service (it would otherwise be a dead process); restore the file as if the
    // move never happened, then "restart" with a fresh service on the same database and folder.
    const original = readFileSync(path);
    await h.run();
    const restored = h.drop('crash.md', original);
    expect(existsSync(restored)).toBe(true);
    const { InboxService } = await import('../../../src/main/inbox/service');
    const restarted = new InboxService({
      db: h.db,
      root: h.root,
      mediaStore: join(h.dataDir, 'media'),
      appVersion: 'test',
      timeZone: 'UTC',
      now: () => h.clock.now,
      watch: false,
      settleMs: 0,
    });
    await restarted.rescan();
    await restarted.idle();
    expect(h.count('SELECT count(*) FROM posts')).toBe(1);
    expect(h.count('SELECT count(*) FROM post_targets')).toBe(1);
    expect(h.receipt('crash').state).toBe('scheduled');
    expect(h.receipt('crash').file).toMatch(/^processed\/2026-11\/crash/);
  });
  it('survives 100 random-bytes files without throwing or posting', async () => {
    h = createHarness();
    for (let index = 0; index < 100; index++) {
      const ext = ['.md', '.json', '.markdown'][index % 3]!;
      const prefix = index % 4 === 0 ? Buffer.from('---\nhandpost: 1\n') : Buffer.alloc(0);
      h.drop(`fuzz-${index}${ext}`, Buffer.concat([prefix, randomBytes(1 + ((index * 37) % 4000))]));
    }
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.inboxFiles()).toEqual([]);
    expect(h.count('SELECT count(*) FROM posts')).toBe(0);
    expect(h.rejectedFiles().filter((name) => !name.endsWith('.error.json'))).toHaveLength(100);
  }, 60000);
});

describe('inbox on Windows-style folders', () => {
  it('suffixes a case-only file name collision in processed/', async () => {
    h = createHarness();
    mkdirSync(join(h.root, 'processed', '2026-11'), { recursive: true });
    writeFileSync(join(h.root, 'processed', '2026-11', 'POST.md'), 'earlier');
    h.drop('post.md', md('id: case\nplatforms: [x]'));
    await h.run();
    expect(h.processedFiles()).toEqual(['2026-11/POST.md', '2026-11/post-1.md']);
    expect(h.receipt('case').file).toBe('processed/2026-11/post-1.md');
  });
});

describe('protocol examples in the inbox', () => {
  it('accepts every example file (post, batch, then cancel)', async () => {
    h = createHarness();
    const fixtures = join(process.cwd(), 'tests', 'fixtures', 'inbox');
    const order = ['2026-11-20-weekly-tip.md', 'release-0-4.json', 'cancel-weekly-tip.json'];
    order.forEach((name, index) => {
      const path = h.drop(name, readFileSync(join(fixtures, name)));
      const time = new Date(Date.now() - (order.length - index) * 10_000);
      utimesSync(path, time, time);
    });
    await h.run();
    expect(h.inboxFiles()).toEqual([]);
    expect(h.rejectedFiles()).toEqual([]);
    expect(h.processedFiles().sort()).toEqual(order.map((name) => `2026-11/${name}`).sort());
    expect(h.receipt('weekly-tips-20261120-folder-scheduling').state).toBe('cancelled');
    expect(h.receipt('release-notes-0-4-x').state).toBe('scheduled');
    expect(h.receipt('release-notes-0-4-linkedin').state).toBe('held');
    for (const id of [
      'weekly-tips-20261120-folder-scheduling',
      'release-notes-0-4-x',
      'release-notes-0-4-linkedin',
    ])
      expect(validateReceipt(h.receipt(id)), JSON.stringify(validateReceipt.errors)).toBe(true);
  });
});
