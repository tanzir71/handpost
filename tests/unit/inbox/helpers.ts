import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openDatabase, type HandpostDatabase } from '../../../src/main/db/database';
import { InboxService, type InboxServiceOptions } from '../../../src/main/inbox/service';
import { ensureLayout } from '../../../src/main/inbox/paths';
import { PLATFORM_IDS } from '../../../src/shared/types';
import { INBOX_PLATFORMS } from '../../../src/shared/inbox-schema';

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
export const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
export const MP4 = Buffer.from('0000001866747970697336d0000000000069736f6d', 'hex');

export interface Harness {
  root: string;
  dataDir: string;
  db: HandpostDatabase;
  service: InboxService;
  clock: { now: Date };
  notices: Array<{ title: string; body: string }>;
  /** Writes a file under inbox/ (creating folders), returns its absolute path. */
  drop(relative: string, content: string | Uint8Array): string;
  /** Rescans and waits until the queue is empty. */
  run(): Promise<void>;
  receipt(id: string): Record<string, unknown> & {
    state: string;
    targets: Array<Record<string, unknown>>;
    warnings: Array<Record<string, unknown>>;
    errors: Array<Record<string, unknown>>;
  };
  hasReceipt(id: string): boolean;
  inboxFiles(): string[];
  processedFiles(): string[];
  rejectedFiles(): string[];
  count(sql: string, ...args: unknown[]): number;
  setting(key: string, value: string): void;
  cleanup(): Promise<void>;
}

function listRecursive(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRecursive(path, base));
    else
      out.push(
        path
          .slice(base.length + 1)
          .split('\\')
          .join('/'),
      );
  }
  return out.sort();
}

export function createHarness(
  options: Partial<InboxServiceOptions> & { autoSchedule?: boolean; accountStatus?: string } = {},
): Harness {
  const base = mkdtempSync(join(tmpdir(), 'handpost-inbox-'));
  const root = join(base, 'Handpost');
  const dataDir = join(base, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase();
  for (const platform of PLATFORM_IDS)
    db.prepare('INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES (?,?,?,?)').run(
      platform,
      platform,
      join(dataDir, 'profiles', platform),
      options.accountStatus ?? 'ok',
    );
  if (options.autoSchedule !== false)
    db.prepare("INSERT INTO settings(key,value) VALUES ('inbox.autoSchedule','true')").run();
  ensureLayout(root);
  const clock = { now: new Date('2026-11-18T03:00:00Z') };
  const notices: Array<{ title: string; body: string }> = [];
  const service = new InboxService({
    db,
    root,
    mediaStore: join(dataDir, 'media'),
    appVersion: '0.2.0-test',
    timeZone: 'UTC',
    now: () => clock.now,
    platforms: [...INBOX_PLATFORMS, 'mock'],
    notify: (title, body) => notices.push({ title, body }),
    watch: false,
    settleMs: 0,
    rescanMs: 3_600_000,
    statusIntervalMs: 3_600_000,
    statusDebounceMs: 10,
    ...options,
  });
  const harness: Harness = {
    root,
    dataDir,
    db,
    service,
    clock,
    notices,
    drop(relative, content) {
      const path = join(root, 'inbox', relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      return path;
    },
    async run() {
      await service.rescan();
      await service.idle();
    },
    receipt(id) {
      return JSON.parse(readFileSync(join(root, 'receipts', `${id}.json`), 'utf8'));
    },
    hasReceipt(id) {
      return existsSync(join(root, 'receipts', `${id}.json`));
    },
    inboxFiles: () => listRecursive(join(root, 'inbox')).filter((path) => !path.startsWith('.tmp/')),
    processedFiles: () => listRecursive(join(root, 'processed')),
    rejectedFiles: () => listRecursive(join(root, 'rejected')),
    count: (sql, ...args) =>
      Number(
        db
          .prepare(sql)
          .pluck()
          .get(...args),
      ),
    setting(key, value) {
      db.prepare(
        'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run(key, value);
    },
    async cleanup() {
      await service.stop();
      db.close();
      removeTree(base);
    },
  };
  return harness;
}

/** rm -rf that also copes with Git's read-only object files on Windows. */
export function removeTree(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    const makeWritable = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = join(dir, entry.name);
        if (entry.isDirectory()) makeWritable(child);
        else chmodSync(child, 0o666);
      }
    };
    makeWritable(path);
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** A Markdown post file. `front` is raw YAML lines; `body` the post text. */
export function md(front: string, body = 'Hello from the inbox'): string {
  return `---\nhandpost: 1\n${front.trim()}\n---\n${body}\n`;
}
