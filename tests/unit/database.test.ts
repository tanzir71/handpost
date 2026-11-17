import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../../src/main/db/database';
import { Repositories } from '../../src/main/db/repositories';

describe('database and repositories', () => {
  it('upgrades an existing version-one database without losing rows', () => {
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    db.exec(readFileSync('src/main/db/migrations/001_initial.sql', 'utf8'));
    db.prepare('INSERT INTO schema_migrations(version) VALUES (1)').run();
    db.prepare("INSERT INTO posts(base_text,status) VALUES ('legacy','draft')").run();
    migrate(db);
    expect(db.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(4);
    expect(db.prepare('SELECT base_text FROM posts').pluck().get()).toBe('legacy');
    expect(
      db
        .prepare("SELECT name FROM pragma_table_info('post_targets') WHERE name='options_json'")
        .pluck()
        .get(),
    ).toBe('options_json');
    expect(
      db.prepare("SELECT name FROM pragma_table_info('media') WHERE name='size_bytes'").pluck().get(),
    ).toBe('size_bytes');
    db.close();
  });
  it('migrates idempotently and covers CRUD for every table', () => {
    const db = openDatabase();
    migrate(db);
    expect(db.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(4);
    const repositories = new Repositories(db);
    const account = repositories.accounts.create({
      platform: 'x',
      displayName: 'X',
      profileDir: 'profiles/x',
    });
    expect(repositories.accounts.get(account)).toMatchObject({ platform: 'x' });
    repositories.accounts.updateStatus(account, 'ok');
    expect(repositories.accounts.get(account)).toMatchObject({ status: 'ok' });
    const post = repositories.posts.create('hello');
    repositories.posts.update(post, 'updated', 'scheduled');
    expect(repositories.posts.get(post)).toMatchObject({ base_text: 'updated' });
    const target = repositories.targets.create({
      postId: post,
      accountId: account,
      scheduledAt: '2026-01-01T00:00:00.000Z',
      jitteredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(repositories.targets.due('2026-01-02T00:00:00.000Z')).toHaveLength(1);
    const media = repositories.media.create({
      post_id: post,
      path: 'a.png',
      kind: 'image',
      size_bytes: 10,
      order_idx: 0,
    });
    const attempt = repositories.attempts.create({
      target_id: target,
      started_at: new Date().toISOString(),
      step_log_json: '[]',
    });
    const slot = repositories.slots.create({ account_id: account, weekday: 1, time_local: '09:00' });
    const template = repositories.templates.create({
      name: 'Hi',
      body: 'Hi {name}',
      variables_json: '["name"]',
    });
    for (const [repository, id] of [
      [repositories.media, media],
      [repositories.attempts, attempt],
      [repositories.slots, slot],
      [repositories.templates, template],
    ] as const)
      expect(repository.get(id)).toBeTruthy();
    expect(repositories.media.get(media)).toMatchObject({ size_bytes: 10 });
    repositories.settings.set('theme', 'dark');
    expect(repositories.settings.get('theme')).toBe('dark');
    repositories.settings.delete('theme');
    expect(repositories.settings.get('theme')).toBeUndefined();
    repositories.media.delete(media);
    repositories.attempts.delete(attempt);
    repositories.slots.delete(slot);
    repositories.templates.delete(template);
    repositories.targets.delete(target);
    repositories.posts.delete(post);
    repositories.accounts.delete(account);
    expect(repositories.posts.list()).toEqual([]);
    db.close();
  });
});
