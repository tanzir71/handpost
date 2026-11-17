import type { HandpostDatabase } from './database';

export class Repositories {
  constructor(readonly db: HandpostDatabase) {}
  accounts = {
    list: () => this.db.prepare('SELECT * FROM accounts ORDER BY id').all(),
    get: (id: number) => this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id),
    create: (v: { platform: string; displayName: string; profileDir: string }) =>
      Number(
        this.db
          .prepare('INSERT INTO accounts(platform,display_name,profile_dir) VALUES (?,?,?)')
          .run(v.platform, v.displayName, v.profileDir).lastInsertRowid,
      ),
    updateStatus: (id: number, status: string) =>
      this.db
        .prepare('UPDATE accounts SET status=?,last_checked_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(status, id),
    delete: (id: number) => this.db.prepare('DELETE FROM accounts WHERE id=?').run(id),
  };
  posts = {
    list: () => this.db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all(),
    get: (id: number) => this.db.prepare('SELECT * FROM posts WHERE id=?').get(id),
    create: (text: string, status = 'draft') =>
      Number(
        this.db.prepare('INSERT INTO posts(base_text,status) VALUES (?,?)').run(text, status).lastInsertRowid,
      ),
    update: (id: number, text: string, status: string) =>
      this.db
        .prepare('UPDATE posts SET base_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(text, status, id),
    delete: (id: number) => this.db.prepare('DELETE FROM posts WHERE id=?').run(id),
  };
  targets = {
    list: () => this.db.prepare('SELECT * FROM post_targets ORDER BY scheduled_at_utc').all(),
    create: (v: {
      postId: number;
      accountId: number;
      scheduledAt: string;
      jitteredAt: string;
      overrideText?: string;
    }) =>
      Number(
        this.db
          .prepare(
            'INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,override_text) VALUES (?,?,?,?,?)',
          )
          .run(v.postId, v.accountId, v.scheduledAt, v.jitteredAt, v.overrideText ?? null).lastInsertRowid,
      ),
    due: (now: string) =>
      this.db
        .prepare(
          "SELECT t.*,p.base_text,a.platform,a.profile_dir FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN accounts a ON a.id=t.account_id WHERE t.status='scheduled' AND t.jittered_at_utc<=? ORDER BY t.jittered_at_utc",
        )
        .all(now),
    setStatus: (id: number, status: string, fields: { url?: string; code?: string; detail?: string } = {}) =>
      this.db
        .prepare(
          'UPDATE post_targets SET status=?,published_url=COALESCE(?,published_url),error_code=?,error_detail=? WHERE id=?',
        )
        .run(status, fields.url ?? null, fields.code ?? null, fields.detail ?? null, id),
    incrementAttempt: (id: number) =>
      this.db.prepare('UPDATE post_targets SET attempt_count=attempt_count+1 WHERE id=?').run(id),
    delete: (id: number) => this.db.prepare('DELETE FROM post_targets WHERE id=?').run(id),
  };
  get media() {
    return crud(this.db, 'media', [
      'post_id',
      'path',
      'kind',
      'width',
      'height',
      'duration_s',
      'size_bytes',
      'order_idx',
      'alt_text',
    ]);
  }
  get attempts() {
    return crud(this.db, 'publish_attempts', [
      'target_id',
      'started_at',
      'finished_at',
      'outcome',
      'step_log_json',
      'screenshot_path',
      'error_class',
    ]);
  }
  get slots() {
    return crud(this.db, 'queue_slots', ['account_id', 'weekday', 'time_local']);
  }
  get templates() {
    return crud(this.db, 'templates', ['name', 'body', 'variables_json']);
  }
  get settings() {
    return {
      list: () => this.db.prepare('SELECT * FROM settings').all(),
      get: (key: string) => this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key),
      set: (key: string, value: string) =>
        this.db
          .prepare(
            'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          )
          .run(key, value),
      delete: (key: string) => this.db.prepare('DELETE FROM settings WHERE key=?').run(key),
    };
  }
}
function crud(db: HandpostDatabase, table: string, columns: string[]) {
  return {
    list: () => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    get: (id: number) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),
    create: (values: Record<string, unknown>) => {
      const used = columns.filter((c) => c in values);
      const result = db
        .prepare(`INSERT INTO ${table}(${used.join(',')}) VALUES (${used.map(() => '?').join(',')})`)
        .run(...used.map((c) => values[c]));
      return Number(result.lastInsertRowid);
    },
    delete: (id: number) => db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id),
  };
}
