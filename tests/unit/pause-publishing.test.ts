import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { Scheduler } from '../../src/main/scheduler/scheduler';

function seed() {
  const db = openDatabase();
  db.prepare(
    "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('mock','Mock','mock','ok')",
  ).run();
  db.prepare("INSERT INTO posts(base_text,status) VALUES ('due','scheduled')").run();
  db.prepare(
    "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','scheduled')",
  ).run();
  return db;
}

describe('Pause publishing (Queue → Pause publishing)', () => {
  it('starts nothing while publishing is paused, even when a post is due', async () => {
    const db = seed();
    db.prepare("INSERT INTO settings(key,value) VALUES ('publishing.paused','true')").run();
    const engine = { context: vi.fn(), close: vi.fn(async () => undefined) } as any;
    const scheduler = new Scheduler(db, engine);
    await scheduler.tick(new Date('2026-01-01T00:05:00Z'));
    await scheduler.idle();
    expect(engine.context).not.toHaveBeenCalled();
    expect(db.prepare('SELECT status FROM post_targets').pluck().get()).toBe('scheduled');
    db.close();
  });

  it('after resuming, a post that went more than two hours late waits for a look instead of publishing', async () => {
    const db = seed();
    db.prepare("INSERT INTO settings(key,value) VALUES ('publishing.paused','true')").run();
    const engine = { context: vi.fn(), close: vi.fn(async () => undefined) } as any;
    const scheduler = new Scheduler(db, engine);
    db.prepare("UPDATE settings SET value='false' WHERE key='publishing.paused'").run();
    // index.ts runs the overdue rule when the owner resumes publishing.
    await scheduler.handleOverdue(new Date('2026-01-01T03:00:01Z'));
    await scheduler.idle();
    expect(engine.context).not.toHaveBeenCalled();
    expect(db.prepare('SELECT status,error_code FROM post_targets').get()).toEqual({
      status: 'needs_attention',
      error_code: 'overdue',
    });
    db.close();
  });
});
