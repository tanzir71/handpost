import Database from 'better-sqlite3';
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * One-time import of data from the app's previous identity, “Relay”.
 *
 * Electron derives the user-data folder from the app name, so renaming the app to Handpost moves it from
 * `<appData>/relay-scheduler` to `<appData>/Handpost`. Without this step every existing user would start with an
 * empty queue and have to log in to every platform again. The old folder is only ever read — never moved or
 * changed — so going back to an older build stays possible.
 */

export const LEGACY_DIR_NAMES = ['relay-scheduler'] as const;
export const MIGRATION_MARKER = 'migrated-from-relay.json';
/** Archives exported before the rename carry their manifest under this name; they still import. */
export const LEGACY_ARCHIVE_MANIFEST = 'relay.json';
/** Shown once after a successful import of the old app's data. */
export const LEGACY_IMPORT_NOTICE = {
  log: 'Imported data from Relay',
  title: 'Handpost imported your Relay data',
  body: 'Drafts, queue, history and browser sessions were copied over. The old Relay folder was left untouched.',
} as const;
const LEGACY_DB = 'relay.db';
const NEW_DB = 'handpost.db';
const COPIED_DIRS = ['profiles', 'media', 'artifacts'] as const;

export interface LegacyMigrationResult {
  migrated: boolean;
  reason?: 'already-migrated' | 'has-data' | 'nothing-to-migrate';
  from?: string;
  copied: string[];
  failed: Array<{ item: string; error: string }>;
}

export function migrateLegacyData(
  appDataDir: string,
  dataDir: string,
  legacyNames: readonly string[] = LEGACY_DIR_NAMES,
): LegacyMigrationResult {
  const copied: string[] = [];
  const failed: LegacyMigrationResult['failed'] = [];
  if (existsSync(join(dataDir, MIGRATION_MARKER)))
    return { migrated: false, reason: 'already-migrated', copied, failed };
  if (existsSync(join(dataDir, NEW_DB))) return { migrated: false, reason: 'has-data', copied, failed };
  const from = legacyNames
    .map((name) => join(appDataDir, name))
    .find((dir) => existsSync(join(dir, LEGACY_DB)));
  if (!from) return { migrated: false, reason: 'nothing-to-migrate', copied, failed };

  mkdirSync(dataDir, { recursive: true });

  // Copy the database together with its write-ahead log under a temporary name, fold the log in and fix stored
  // paths, then rename into place. A crash before the rename simply means the next start retries.
  const staging = join(dataDir, `${NEW_DB}.migrating`);
  for (const suffix of ['-wal', '-shm', '']) rmSync(`${staging}${suffix}`, { force: true });
  copyFileSync(join(from, LEGACY_DB), staging);
  if (existsSync(join(from, `${LEGACY_DB}-wal`)))
    copyFileSync(join(from, `${LEGACY_DB}-wal`), `${staging}-wal`);
  rewriteStoredPaths(staging, from, dataDir);
  for (const suffix of ['-wal', '-shm']) rmSync(`${staging}${suffix}`, { force: true });
  renameSync(staging, join(dataDir, NEW_DB));
  copied.push(LEGACY_DB);

  for (const dir of COPIED_DIRS) {
    const source = join(from, dir);
    if (!existsSync(source)) continue;
    try {
      cpSync(source, join(dataDir, dir), { recursive: true, force: false, errorOnExist: false });
      copied.push(`${dir}/`);
    } catch (error) {
      failed.push({ item: `${dir}/`, error: error instanceof Error ? error.message : String(error) });
    }
  }

  writeFileSync(
    join(dataDir, MIGRATION_MARKER),
    JSON.stringify({ from, migratedAt: new Date().toISOString(), copied, failed }, null, 2),
  );
  return { migrated: true, from, copied, failed };
}

/** Absolute paths into the old folder (browser profiles, media, proof screenshots) are re-pointed at the new one. */
export function rewriteStoredPaths(dbPath: string, from: string, to: string): void {
  const db = new Database(dbPath);
  try {
    const oldPrefix = `${from}${sep}`;
    const newPrefix = `${to}${sep}`;
    const jsonOld = JSON.stringify(oldPrefix).slice(1, -1);
    const jsonNew = JSON.stringify(newPrefix).slice(1, -1);
    const columns: Array<[string, string]> = [
      ['accounts', 'profile_dir'],
      ['media', 'path'],
      ['publish_attempts', 'screenshot_path'],
    ];
    db.transaction(() => {
      for (const [table, column] of columns) {
        db.prepare(
          `UPDATE ${table} SET ${column} = ? || substr(${column}, length(?) + 1) WHERE substr(${column}, 1, length(?)) = ?`,
        ).run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
      }
      db.prepare(
        'UPDATE publish_attempts SET step_log_json = replace(step_log_json, ?, ?) WHERE instr(step_log_json, ?) > 0',
      ).run(jsonOld, jsonNew, jsonOld);
    })();
  } finally {
    db.close();
  }
}
