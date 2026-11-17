import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { MIGRATION_MARKER, migrateLegacyData } from '../../src/main/migrate-legacy';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function legacyInstall() {
  const appData = mkdtempSync(join(tmpdir(), 'handpost-migrate-'));
  roots.push(appData);
  const legacy = join(appData, 'relay-scheduler');
  mkdirSync(join(legacy, 'profiles', 'x'), { recursive: true });
  mkdirSync(join(legacy, 'media', '1'), { recursive: true });
  writeFileSync(join(legacy, 'profiles', 'x', 'Preferences'), '{"session":"kept"}');
  writeFileSync(join(legacy, 'media', '1', 'a.png'), 'png');
  const db = openDatabase(join(legacy, 'relay.db'));
  const account = Number(
    db.prepare("INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('x','X',?,'ok')").run(join(legacy, 'profiles', 'x')).lastInsertRowid,
  );
  const post = Number(db.prepare("INSERT INTO posts(base_text,status) VALUES ('hello','published')").run().lastInsertRowid);
  db.prepare("INSERT INTO media(post_id,path,kind) VALUES (?,?,'image')").run(post, join(legacy, 'media', '1', 'a.png'));
  const target = Number(
    db.prepare("INSERT INTO post_targets(post_id,account_id,status) VALUES (?,?,'published')").run(post, account).lastInsertRowid,
  );
  const proof = join(legacy, 'artifacts', 'proof.png');
  db.prepare("INSERT INTO publish_attempts(target_id,started_at,outcome,step_log_json,screenshot_path) VALUES (?,datetime('now'),'published',?,?)").run(
    target,
    JSON.stringify([{ name: 'submit', screenshotPath: proof }]),
    proof,
  );
  db.close();
  return { appData, legacy, newDir: join(appData, 'Handpost') };
}

describe('Relay → Handpost data migration', () => {
  it('copies the database, sessions and media and re-points stored paths, leaving the old folder untouched', () => {
    const { appData, legacy, newDir } = legacyInstall();
    const result = migrateLegacyData(appData, newDir);
    expect(result.migrated).toBe(true);
    expect(result.from).toBe(legacy);
    expect(result.copied).toEqual(['relay.db', 'profiles/', 'media/']);
    expect(readFileSync(join(newDir, 'profiles', 'x', 'Preferences'), 'utf8')).toContain('kept');
    expect(existsSync(join(newDir, 'media', '1', 'a.png'))).toBe(true);
    expect(existsSync(join(legacy, 'relay.db'))).toBe(true);
    expect(existsSync(join(newDir, 'handpost.db.migrating'))).toBe(false);

    const db = new Database(join(newDir, 'handpost.db'), { readonly: true });
    expect(db.prepare('SELECT profile_dir FROM accounts').pluck().get()).toBe(join(newDir, 'profiles', 'x'));
    expect(db.prepare('SELECT path FROM media').pluck().get()).toBe(join(newDir, 'media', '1', 'a.png'));
    expect(db.prepare('SELECT screenshot_path FROM publish_attempts').pluck().get()).toBe(join(newDir, 'artifacts', 'proof.png'));
    const steps = JSON.parse(String(db.prepare('SELECT step_log_json FROM publish_attempts').pluck().get()));
    expect(steps[0].screenshotPath).toBe(join(newDir, 'artifacts', 'proof.png'));
    expect(db.prepare('SELECT base_text FROM posts').pluck().get()).toBe('hello');
    db.close();

    const marker = JSON.parse(readFileSync(join(newDir, MIGRATION_MARKER), 'utf8'));
    expect(marker.from).toBe(legacy);
  });

  it('runs only once', () => {
    const { appData, newDir } = legacyInstall();
    expect(migrateLegacyData(appData, newDir).migrated).toBe(true);
    expect(migrateLegacyData(appData, newDir)).toMatchObject({ migrated: false, reason: 'already-migrated' });
  });

  it('never overwrites an existing Handpost database', () => {
    const { appData, newDir } = legacyInstall();
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, 'handpost.db'), '');
    expect(migrateLegacyData(appData, newDir)).toMatchObject({ migrated: false, reason: 'has-data' });
  });

  it('does nothing on a fresh install', () => {
    const appData = mkdtempSync(join(tmpdir(), 'handpost-fresh-'));
    roots.push(appData);
    expect(migrateLegacyData(appData, join(appData, 'Handpost'))).toMatchObject({ migrated: false, reason: 'nothing-to-migrate' });
    expect(existsSync(join(appData, 'Handpost'))).toBe(false);
  });

  it('only rewrites paths that start with the old folder', () => {
    const { appData, legacy, newDir } = legacyInstall();
    const db = new Database(join(legacy, 'relay.db'));
    db.prepare("UPDATE media SET path = ?").run(`${sep}elsewhere${sep}relay-scheduler-backup${sep}a.png`);
    db.close();
    migrateLegacyData(appData, newDir);
    const copy = new Database(join(newDir, 'handpost.db'), { readonly: true });
    expect(copy.prepare('SELECT path FROM media').pluck().get()).toBe(`${sep}elsewhere${sep}relay-scheduler-backup${sep}a.png`);
    copy.close();
  });
});
