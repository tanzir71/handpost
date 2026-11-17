/** Repository for `inbox_items` (one row per protocol id) and `inbox_files` (one row per handled file). */
import type { HandpostDatabase } from '../db/database';
import type { InboxIssue, InboxItemState } from '../../shared/inbox-schema';

export interface InboxItemRow {
  id: string;
  post_id: number | null;
  source: string | null;
  source_kind: string;
  file_name: string;
  stored_path: string | null;
  content_hash: string;
  state: InboxItemState;
  mode: string;
  warnings_json: string;
  errors_json: string;
  first_seen_at: string;
  received_at: string;
  updated_at: string;
  terminal_at: string | null;
  replaced_at: string | null;
  root: string;
}

export interface InboxFileRow {
  id: number;
  item_id: string | null;
  file_name: string;
  stored_path: string | null;
  source: string | null;
  outcome: string;
  content_hash: string;
  errors_json: string;
  processed_at: string;
  root: string;
}

export const TERMINAL_STATES: InboxItemState[] = [
  'published',
  'partial',
  'failed',
  'cancelled',
  'rejected',
  'duplicate',
];

export interface UpsertItem {
  id: string;
  postId: number | null;
  source: string | null;
  sourceKind: string;
  fileName: string;
  storedPath: string | null;
  contentHash: string;
  state: InboxItemState;
  mode: string;
  warnings: InboxIssue[];
  errors: InboxIssue[];
  firstSeenAt: string;
  receivedAt: string;
  replacedAt?: string | null;
  root?: string;
}

export class InboxStore {
  constructor(private readonly db: HandpostDatabase) {}

  get(id: string): InboxItemRow | undefined {
    return this.db.prepare('SELECT * FROM inbox_items WHERE id=?').get(id) as InboxItemRow | undefined;
  }

  byPost(postId: number): InboxItemRow | undefined {
    return this.db.prepare('SELECT * FROM inbox_items WHERE post_id=?').get(postId) as
      InboxItemRow | undefined;
  }

  list(): InboxItemRow[] {
    return this.db.prepare('SELECT * FROM inbox_items ORDER BY received_at DESC, id').all() as InboxItemRow[];
  }

  upsert(item: UpsertItem): void {
    const now = new Date().toISOString();
    const terminal = TERMINAL_STATES.includes(item.state) ? now : null;
    this.db
      .prepare(
        `INSERT INTO inbox_items(id,post_id,source,source_kind,file_name,stored_path,content_hash,state,mode,warnings_json,errors_json,first_seen_at,received_at,updated_at,terminal_at,replaced_at,root)
         VALUES (@id,@postId,@source,@sourceKind,@fileName,@storedPath,@contentHash,@state,@mode,@warnings,@errors,@firstSeenAt,@receivedAt,@now,@terminal,@replacedAt,@root)
         ON CONFLICT(id) DO UPDATE SET post_id=excluded.post_id,source=excluded.source,source_kind=excluded.source_kind,
           file_name=excluded.file_name,stored_path=excluded.stored_path,content_hash=excluded.content_hash,state=excluded.state,
           mode=excluded.mode,warnings_json=excluded.warnings_json,errors_json=excluded.errors_json,
           first_seen_at=excluded.first_seen_at,received_at=excluded.received_at,updated_at=excluded.updated_at,
           terminal_at=excluded.terminal_at,replaced_at=COALESCE(excluded.replaced_at,inbox_items.replaced_at),root=excluded.root`,
      )
      .run({
        ...item,
        warnings: JSON.stringify(item.warnings),
        errors: JSON.stringify(item.errors),
        replacedAt: item.replacedAt ?? null,
        root: item.root ?? 'local',
        now,
        terminal,
      });
  }

  setState(
    id: string,
    state: InboxItemState,
    extra: { warnings?: InboxIssue[]; storedPath?: string } = {},
  ): void {
    const row = this.get(id);
    if (!row) return;
    const terminal = TERMINAL_STATES.includes(state) ? (row.terminal_at ?? new Date().toISOString()) : null;
    this.db
      .prepare(
        'UPDATE inbox_items SET state=?,terminal_at=?,updated_at=?,warnings_json=COALESCE(?,warnings_json),stored_path=COALESCE(?,stored_path) WHERE id=?',
      )
      .run(
        state,
        terminal,
        new Date().toISOString(),
        extra.warnings ? JSON.stringify(extra.warnings) : null,
        extra.storedPath ?? null,
        id,
      );
  }

  logFile(entry: {
    itemId: string | null;
    fileName: string;
    storedPath: string | null;
    source: string | null;
    outcome: string;
    contentHash: string;
    errors?: InboxIssue[];
    root?: string;
  }): void {
    this.db
      .prepare(
        'INSERT INTO inbox_files(item_id,file_name,stored_path,source,outcome,content_hash,errors_json,processed_at,root) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        entry.itemId,
        entry.fileName,
        entry.storedPath,
        entry.source,
        entry.outcome,
        entry.contentHash,
        JSON.stringify(entry.errors ?? []),
        new Date().toISOString(),
        entry.root ?? 'local',
      );
  }

  /** Has a file with this content already been fully handled (e.g. a remote clone file seen again)? */
  seenFile(contentHash: string, fileName: string, root: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM inbox_files WHERE content_hash=? AND file_name=? AND root=? LIMIT 1')
        .get(contentHash, fileName, root),
    );
  }

  files(limit = 500): InboxFileRow[] {
    return this.db
      .prepare('SELECT * FROM inbox_files ORDER BY processed_at DESC, id DESC LIMIT ?')
      .all(limit) as InboxFileRow[];
  }
}

export function parseIssues(json: string | null | undefined): InboxIssue[] {
  try {
    const value = JSON.parse(json ?? '[]');
    return Array.isArray(value) ? (value as InboxIssue[]) : [];
  } catch {
    return [];
  }
}
