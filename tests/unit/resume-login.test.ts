import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { resumeAfterLogin } from '../../src/main/accounts/resume';

describe('resuming after a fresh login', () => {
  it('re-queues recent needs_login posts and parks stale ones for review', () => {
    const db = openDatabase();
    db.prepare(
      "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('x','X','x','ok')",
    ).run();
    db.prepare(
      "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('bluesky','B','b','ok')",
    ).run();
    const now = new Date('2026-11-18T12:00:00Z');
    const add = (account: number, when: string) => {
      const post = Number(
        db.prepare("INSERT INTO posts(base_text,status) VALUES ('p','failed')").run().lastInsertRowid,
      );
      db.prepare(
        "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status,error_code) VALUES (?,?,?,?,'needs_login','logged_out')",
      ).run(post, account, when, when);
    };
    add(1, '2026-11-18T11:30:00Z'); // 30 min late → resume soon
    add(1, '2026-11-18T15:00:00Z'); // future → keep its time
    add(1, '2026-11-18T08:00:00Z'); // 4 h late → needs attention
    add(2, '2026-11-18T11:30:00Z'); // other platform → untouched
    expect(resumeAfterLogin(db, 'x', now)).toBe(2);
    const rows = db
      .prepare('SELECT status,error_code,jittered_at_utc FROM post_targets ORDER BY id')
      .all() as Array<{
      status: string;
      error_code: string | null;
      jittered_at_utc: string;
    }>;
    expect(rows.map((row) => row.status)).toEqual([
      'scheduled',
      'scheduled',
      'needs_attention',
      'needs_login',
    ]);
    expect(rows[2]!.error_code).toBe('overdue');
    expect(
      Math.abs(Date.parse(rows[0]!.jittered_at_utc) - Date.parse('2026-11-18T12:01:00Z')),
    ).toBeLessThanOrEqual(90_000);
    expect(
      Math.abs(Date.parse(rows[1]!.jittered_at_utc) - Date.parse('2026-11-18T15:00:00Z')),
    ).toBeLessThanOrEqual(90_000);
    expect(db.prepare('SELECT status FROM posts ORDER BY id').pluck().all()).toEqual([
      'scheduled',
      'scheduled',
      'failed',
      'failed',
    ]);
  });
});
