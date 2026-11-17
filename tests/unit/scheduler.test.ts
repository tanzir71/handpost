import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { Scheduler } from '../../src/main/scheduler/scheduler';
import { capabilities } from '../../src/shared/capabilities';
import type { PlatformId } from '../../src/shared/types';

function setup(platform: PlatformId = 'mock') {
  const db = openDatabase();
  db.prepare('INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES (?,?,?,?)').run(
    platform,
    platform,
    platform,
    'ok',
  );
  return db;
}
function due(db: ReturnType<typeof openDatabase>, text: string, when = '2026-01-01T00:00:00.000Z') {
  const postId = Number(
    db.prepare("INSERT INTO posts(base_text,status) VALUES (?,'scheduled')").run(text).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (?,1,?,?,'scheduled')",
  ).run(postId, when, when);
  return postId;
}
function fakes(platform: PlatformId = 'mock', delay = 0, session: 'ok' | 'challenged' = 'ok') {
  let active = 0;
  let peak = 0;
  const page = {} as any;
  const ctx = { pages: () => [page], newPage: async () => page } as any;
  const engine = { context: vi.fn(async () => ctx), close: vi.fn(async () => {}) } as any;
  const adapter = {
    id: platform,
    capabilities: capabilities[platform],
    validate: vi.fn(() => [] as string[]),
    checkSession: vi.fn(async () => session),
    publish: vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return { submitted: true };
    }),
    verify: vi.fn(async () => ({ found: true, url: 'https://mock/post', screenshotPath: 'proof.png' })),
  };
  return { engine, adapter, peak: () => peak };
}
describe('scheduler invariants', () => {
  it('serializes all publishing globally and closes the idle engine', async () => {
    const db = setup();
    due(db, 'one');
    due(db, 'two');
    due(db, 'three');
    const fake = fakes('mock', 10);
    const scheduler = new Scheduler(
      db,
      fake.engine,
      () => {},
      () => fake.adapter,
    );
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(fake.peak()).toBe(1);
    expect(db.prepare("SELECT count(*) FROM posts WHERE status='published'").pluck().get()).toBe(3);
    expect(fake.engine.close).toHaveBeenCalledWith('mock');
    db.close();
  });
  it('reserves a same-platform cooldown before queued jobs can race', async () => {
    const db = setup('x');
    due(db, 'one');
    due(db, 'two');
    const fake = fakes('x');
    const scheduler = new Scheduler(
      db,
      fake.engine,
      () => {},
      () => fake.adapter,
    );
    const now = new Date('2026-01-01T00:01:00Z');
    await scheduler.tick(now);
    await scheduler.idle();
    expect(db.prepare("SELECT count(*) FROM post_targets WHERE status='published'").pluck().get()).toBe(1);
    const scheduled = db
      .prepare("SELECT jittered_at_utc FROM post_targets WHERE status='scheduled'")
      .pluck()
      .get() as string;
    expect(new Date(scheduled).getTime()).toBeGreaterThanOrEqual(now.getTime() + 180_000);
    db.close();
  });
  it('hard-stops at the configured daily cap', async () => {
    const db = setup('x');
    const postId = due(db, 'blocked', '2026-01-01T12:00:00Z');
    for (let index = 0; index < 10; index++) {
      const prior = due(db, `prior ${index}`, '2025-12-31T00:00:00Z');
      db.prepare("UPDATE post_targets SET status='published' WHERE post_id=?").run(prior);
      const targetId = db.prepare('SELECT id FROM post_targets WHERE post_id=?').pluck().get(prior);
      db.prepare(
        "INSERT INTO publish_attempts(target_id,started_at,finished_at,outcome,step_log_json) VALUES (?,'2026-01-01T01:00:00Z','2026-01-01T01:00:01Z','published','[]')",
      ).run(targetId);
    }
    const notify = vi.fn();
    const fake = fakes('x');
    const scheduler = new Scheduler(db, fake.engine, notify, () => fake.adapter);
    await scheduler.tick(new Date('2026-01-01T12:01:00Z'));
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe(
      'needs_attention',
    );
    expect(db.prepare('SELECT status FROM posts WHERE id=?').pluck().get(postId)).toBe('failed');
    expect(notify).toHaveBeenCalledWith('Handpost daily cap reached', expect.any(String));
    db.close();
  });
  it('notifies and publishes recent missed work while flagging stale work', async () => {
    const db = setup();
    const recent = due(db, 'recent', '2026-01-01T02:30:00Z');
    const stale = due(db, 'stale', '2026-01-01T00:00:00Z');
    const notify = vi.fn();
    const fake = fakes();
    const scheduler = new Scheduler(db, fake.engine, notify, () => fake.adapter);
    await scheduler.handleOverdue(new Date('2026-01-01T03:00:00Z'));
    await scheduler.idle();
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(recent)).toBe(
      'published',
    );
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(stale)).toBe(
      'needs_attention',
    );
    expect(db.prepare('SELECT status FROM posts WHERE id=?').pluck().get(stale)).toBe('failed');
    expect(notify).toHaveBeenCalledWith('Handpost is publishing missed posts', expect.any(String));
    db.close();
  });
  it('freezes every queued target after a challenged session', async () => {
    const db = setup('instagram');
    const first = due(db, 'first');
    const second = due(db, 'second', '2026-01-01T01:00:00Z');
    const fake = fakes('instagram', 0, 'challenged');
    const notify = vi.fn();
    const scheduler = new Scheduler(db, fake.engine, notify, () => fake.adapter);
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(db.prepare('SELECT status FROM accounts WHERE platform=?').pluck().get('instagram')).toBe(
      'frozen',
    );
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(first)).toBe('manual');
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(second)).toBe('manual');
    expect(
      db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('breaker:instagram:until'),
    ).toMatch(/^2026-|^manual$/);
    expect(notify).toHaveBeenCalledWith('Handpost automation frozen', expect.stringContaining('challenged'));
    db.close();
  });
  it('keeps a processing timeout scheduled with transient backoff', async () => {
    const db = setup('tiktok');
    const postId = due(db, 'video');
    const fake = fakes('tiktok');
    fake.adapter.publish.mockRejectedValue(new Error('Upload processing Timeout 300000ms'));
    const scheduler = new Scheduler(
      db,
      fake.engine,
      () => {},
      () => fake.adapter,
    );
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe(
      'scheduled',
    );
    expect(db.prepare('SELECT error_code FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe(
      'transient',
    );
    expect(db.prepare('SELECT error_class FROM publish_attempts').pluck().get()).toBe('transient');
    db.close();
  });
  it('rejects invalid content before opening a browser', async () => {
    const db = setup('x');
    const postId = due(db, 'invalid');
    const fake = fakes('x');
    fake.adapter.validate.mockReturnValue(['Text exceeds 280 characters']);
    const scheduler = new Scheduler(
      db,
      fake.engine,
      () => {},
      () => fake.adapter,
    );
    await scheduler.tick(new Date('2026-01-01T00:01:00Z'));
    await scheduler.idle();
    expect(fake.engine.context).not.toHaveBeenCalled();
    expect(db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe('failed');
    expect(db.prepare('SELECT error_code FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe(
      'invalid_content',
    );
    expect(db.prepare('SELECT attempt_count FROM post_targets WHERE post_id=?').pluck().get(postId)).toBe(0);
    db.close();
  });
});
