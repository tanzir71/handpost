import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { applyCsvImport, planCsvImport } from '../../src/main/data/csv';
import { exportArchive, importArchive } from '../../src/main/data/archive';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bulk import and archive', () => {
  it('auto-distributes ten CSV posts into queue slots', () => {
    const db = openDatabase();
    db.prepare("INSERT INTO accounts(platform,display_name,profile_dir) VALUES ('x','X','x')").run();
    for (let day = 1; day <= 5; day++)
      for (const time of ['09:00', '15:00'])
        db.prepare('INSERT INTO queue_slots(account_id,weekday,time_local) VALUES (1,?,?)').run(day, time);
    const csv = ['text,platform', ...Array.from({ length: 10 }, (_, index) => `post ${index + 1},x`)].join(
      '\n',
    );
    const rows = planCsvImport(db, csv, new Date(2026, 0, 4, 8));
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.scheduledAt)).size).toBe(10);
    applyCsvImport(db, rows);
    expect(db.prepare("SELECT count(*) FROM post_targets WHERE status='scheduled'").pluck().get()).toBe(10);
    db.close();
  });
  it('round-trips posts, targets, history evidence, settings and media through a zip', () => {
    const root = mkdtempSync(join(tmpdir(), 'handpost-'));
    roots.push(root);
    const mediaPath = join(root, 'image.png');
    const proofPath = join(root, 'proof.png');
    const failurePath = join(root, 'failure.png');
    writeFileSync(mediaPath, 'image bytes');
    writeFileSync(proofPath, 'proof bytes');
    writeFileSync(failurePath, 'failure bytes');
    const db = openDatabase();
    db.prepare("INSERT INTO accounts(platform,display_name,profile_dir) VALUES ('x','X','x')").run();
    db.prepare("INSERT INTO posts(id,base_text,status) VALUES (7,'hello','published')").run();
    db.prepare(
      "INSERT INTO post_targets(id,post_id,account_id,status,published_url,options_json) VALUES (8,7,1,'published','https://x.test/1',?)",
    ).run('{"title":"Hello"}');
    db.prepare(
      "INSERT INTO media(id,post_id,path,kind,size_bytes,order_idx,alt_text) VALUES (9,7,?,'image',11,0,'alt')",
    ).run(mediaPath);
    const logs = JSON.stringify([
      {
        name: 'submit',
        startedAt: '2026-01-01',
        finishedAt: '2026-01-01',
        outcome: 'failed',
        screenshotPath: failurePath,
      },
    ]);
    db.prepare(
      "INSERT INTO publish_attempts(id,target_id,started_at,outcome,step_log_json,screenshot_path) VALUES (10,8,'2026-01-01','published',?,?)",
    ).run(logs, proofPath);
    db.prepare("INSERT INTO settings(key,value) VALUES ('theme','dark')").run();
    const archive = join(root, 'handpost.zip');
    exportArchive(db, archive);
    expect(readFileSync(archive).length).toBeGreaterThan(20);
    db.exec(
      'DELETE FROM publish_attempts;DELETE FROM post_targets;DELETE FROM media;DELETE FROM posts;DELETE FROM settings;',
    );
    importArchive(db, archive, root);
    expect(db.prepare('SELECT base_text FROM posts WHERE id=7').pluck().get()).toBe('hello');
    expect(db.prepare('SELECT published_url FROM post_targets WHERE id=8').pluck().get()).toBe(
      'https://x.test/1',
    );
    expect(db.prepare('SELECT options_json FROM post_targets WHERE id=8').pluck().get()).toBe(
      '{"title":"Hello"}',
    );
    expect(db.prepare('SELECT alt_text FROM media WHERE id=9').pluck().get()).toBe('alt');
    expect(db.prepare('SELECT size_bytes FROM media WHERE id=9').pluck().get()).toBe(11);
    expect(db.prepare('SELECT outcome FROM publish_attempts WHERE id=10').pluck().get()).toBe('published');
    const restoredProof = db
      .prepare('SELECT screenshot_path FROM publish_attempts WHERE id=10')
      .pluck()
      .get() as string;
    const restoredLogs = JSON.parse(
      db.prepare('SELECT step_log_json FROM publish_attempts WHERE id=10').pluck().get() as string,
    );
    expect(existsSync(restoredProof)).toBe(true);
    expect(readFileSync(restoredProof, 'utf8')).toBe('proof bytes');
    expect(existsSync(restoredLogs[0].screenshotPath)).toBe(true);
    expect(readFileSync(restoredLogs[0].screenshotPath, 'utf8')).toBe('failure bytes');
    expect(db.prepare("SELECT value FROM settings WHERE key='theme'").pluck().get()).toBe('dark');
    db.close();
  });
});
