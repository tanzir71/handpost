import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { Scheduler } from '../../src/main/scheduler/scheduler';

function setup(status: string, found: boolean) {
  const db = openDatabase();
  db.prepare(
    "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('mock','Mock','mock','ok')",
  ).run();
  db.prepare("INSERT INTO posts(base_text,status) VALUES ('Submitted earlier','needs_attention')").run();
  db.prepare(
    "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',?)",
  ).run(status);
  const page = { screenshot: vi.fn(async () => undefined) };
  const engine = {
    context: vi.fn(async () => ({ pages: () => [page], newPage: async () => page })),
    close: vi.fn(async () => undefined),
  } as any;
  const adapter = {
    id: 'mock',
    validate: () => [],
    checkSession: vi.fn(async () => 'ok'),
    publish: vi.fn(async () => ({})),
    verify: vi.fn(async () => (found ? { found: true, url: 'http://127.0.0.1:4178/p/1' } : { found: false })),
  } as any;
  const scheduler = new Scheduler(
    db,
    engine,
    () => {},
    () => adapter,
  );
  return { db, engine, adapter, scheduler };
}

describe('Queue → Retry verify', () => {
  it('checks the profile again and never opens the composer or submits', async () => {
    const { db, adapter, engine, scheduler } = setup('unverified', true);
    await expect(scheduler.reverify(1)).resolves.toBe('published');
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(adapter.verify).toHaveBeenCalledOnce();
    expect(engine.close).toHaveBeenCalledWith('mock');
    expect(db.prepare('SELECT status,published_url FROM post_targets').get()).toEqual({
      status: 'published',
      published_url: 'http://127.0.0.1:4178/p/1',
    });
    const attempt = db.prepare('SELECT outcome,step_log_json FROM publish_attempts').get() as {
      outcome: string;
      step_log_json: string;
    };
    expect(attempt.outcome).toBe('published');
    expect(JSON.parse(attempt.step_log_json).map((step: { name: string }) => step.name)).toEqual([
      'verify on own profile',
    ]);
    db.close();
  });

  it('stays unverified when the post is still not found', async () => {
    const { db, adapter, scheduler } = setup('unverified', false);
    await expect(scheduler.reverify(1)).resolves.toBe('unverified');
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(db.prepare('SELECT status FROM post_targets').pluck().get()).toBe('unverified');
    db.close();
  });

  it('refuses targets that are not unverified', async () => {
    const { db, adapter, engine, scheduler } = setup('failed', true);
    await expect(scheduler.reverify(1)).rejects.toThrow(/Only unverified/);
    expect(engine.context).not.toHaveBeenCalled();
    expect(adapter.verify).not.toHaveBeenCalled();
    db.close();
  });
});
