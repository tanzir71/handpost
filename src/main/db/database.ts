import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RelayDatabase = Database.Database;
export function openDatabase(path = ':memory:'): RelayDatabase {
  const db = new Database(path);
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL');
  migrate(db); return db;
}
export function migrate(db: RelayDatabase): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const version = 1;
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) {
    const runtimeDir=typeof __dirname==='string'?__dirname:process.cwd();
    const candidates = [join(runtimeDir,'migrations','001_initial.sql'), join(process.cwd(),'src/main/db/migrations/001_initial.sql')];
    const file = candidates.find(p => { try { readFileSync(p); return true; } catch { return false; } });
    if (!file) throw new Error('Migration 001_initial.sql not found');
    db.transaction(() => { db.exec(readFileSync(file,'utf8')); db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(version); })();
  }
}
