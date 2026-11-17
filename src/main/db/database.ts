import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type HandpostDatabase = Database.Database;
export function openDatabase(path = ':memory:'): HandpostDatabase {
  const db = new Database(path);
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL');
  migrate(db); return db;
}
export function migrate(db: HandpostDatabase): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const runtimeDir=typeof __dirname==='string'?__dirname:process.cwd();
  for(const [version,name] of [[1,'001_initial.sql'],[2,'002_target_options.sql'],[3,'003_media_size.sql']] as const){if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version))continue;const candidates=[join(runtimeDir,'migrations',name),join(process.cwd(),'src/main/db/migrations',name)];const file=candidates.find(path=>{try{readFileSync(path);return true;}catch{return false;}});if(!file)throw new Error(`Migration ${name} not found`);db.transaction(()=>{db.exec(readFileSync(file,'utf8'));db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(version);})();}
}
