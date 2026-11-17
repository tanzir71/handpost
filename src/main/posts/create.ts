/**
 * The one place posts, targets and media rows are written. IPC (`save-post`, `queue-post`), CSV import and
 * the inbox all go through here so validation-relevant shape, jitter and media handling cannot drift apart.
 */
import type { HandpostDatabase } from '../db/database';
import { jitterDate, type RandomSource } from '../engine/humanizer';
import { nextFreeSlot, type QueueSlot } from '../scheduler/slots';
import { recalculatePostStatus } from '../scheduler/status';
import type { TargetStatus } from '../../shared/types';

/** Used when an account has no queue slots configured: every day at 09:30 and 17:30 local time. */
export const DEFAULT_SLOT_TIMES = ['09:30', '17:30'] as const;
export const DEFAULT_SLOTS: QueueSlot[] = Array.from({ length: 7 }, (_, weekday) =>
  DEFAULT_SLOT_TIMES.map((timeLocal) => ({ weekday, timeLocal })),
).flat();

export function accountSlots(
  db: HandpostDatabase,
  accountId: number,
): { slots: QueueSlot[]; usedDefault: boolean } {
  const slots = db
    .prepare('SELECT weekday,time_local AS timeLocal FROM queue_slots WHERE account_id=?')
    .all(accountId) as QueueSlot[];
  return slots.length ? { slots, usedDefault: false } : { slots: DEFAULT_SLOTS, usedDefault: true };
}

/** Times already taken on an account (scheduled, publishing, or held for review). */
export function occupiedTimes(db: HandpostDatabase, accountId: number): string[] {
  return db
    .prepare(
      "SELECT scheduled_at_utc FROM post_targets WHERE account_id=? AND scheduled_at_utc IS NOT NULL AND status IN ('scheduled','publishing','draft')",
    )
    .pluck()
    .all(accountId) as string[];
}

/** The account's next free queue slot after `from`, falling back to the default template. */
export function nextQueueSlot(
  db: HandpostDatabase,
  accountId: number,
  from: Date = new Date(),
  timeZone?: string,
): { at: Date; usedDefault: boolean } {
  const { slots, usedDefault } = accountSlots(db, accountId);
  const at = nextFreeSlot(slots, occupiedTimes(db, accountId), from, timeZone);
  if (!at) throw new Error('No free queue slot in the next 120 days; add slots in Accounts.');
  return { at, usedDefault };
}

/** The next `count` free slots for an account, for the status file. */
export function nextQueueSlots(
  db: HandpostDatabase,
  accountId: number,
  count: number,
  from: Date = new Date(),
  timeZone?: string,
): Date[] {
  const { slots } = accountSlots(db, accountId);
  const occupied = occupiedTimes(db, accountId);
  const result: Date[] = [];
  let cursor = from;
  while (result.length < count) {
    const next = nextFreeSlot(slots, occupied, cursor, timeZone);
    if (!next) break;
    result.push(next);
    occupied.push(next.toISOString());
    cursor = next;
  }
  return result;
}

export interface TargetInput {
  accountId: number;
  scheduledAt?: Date | string | null | undefined;
  overrideText?: string | null | undefined;
  firstComment?: string | null | undefined;
  options?: Record<string, string | boolean> | undefined;
  /** Defaults to the post's status. Held inbox items use `draft` targets that already carry a time. */
  status?: TargetStatus | undefined;
}

export interface MediaInputRow {
  path: string;
  kind: 'image' | 'video';
  width?: number | null | undefined;
  height?: number | null | undefined;
  durationS?: number | null | undefined;
  sizeBytes?: number | null | undefined;
  altText?: string | null | undefined;
}

export interface SavePostInput {
  id?: number | undefined;
  text: string;
  status: 'draft' | 'scheduled';
  targets: TargetInput[];
  labels?: string[] | undefined;
  /** When given, the post's media rows are replaced by these (in order). */
  media?: MediaInputRow[] | undefined;
  /**
   * Which existing targets are replaced: `unsent` (draft/scheduled — what the composer edits) or `all`
   * (used by inbox `on_conflict: replace`, which is only allowed when nothing was published).
   */
  replace?: 'unsent' | 'all';
  random?: RandomSource;
}

/** Inserts or updates a post with its targets (and optionally media). Returns the post id. */
export function savePost(db: HandpostDatabase, input: SavePostInput): number {
  const id = db.transaction(() => {
    let postId = input.id;
    const labels = input.labels ? JSON.stringify(input.labels) : null;
    if (postId)
      db.prepare(
        'UPDATE posts SET base_text=?,status=?,labels_json=COALESCE(?,labels_json),updated_at=CURRENT_TIMESTAMP WHERE id=?',
      ).run(input.text, input.status, labels, postId);
    else
      postId = Number(
        db
          .prepare('INSERT INTO posts(base_text,status,labels_json) VALUES (?,?,?)')
          .run(input.text, input.status, labels ?? '[]').lastInsertRowid,
      );
    if (input.replace === 'all') db.prepare('DELETE FROM post_targets WHERE post_id=?').run(postId);
    else
      db.prepare("DELETE FROM post_targets WHERE post_id=? AND status IN ('draft','scheduled')").run(postId);
    const insert = db.prepare(
      'INSERT INTO post_targets(post_id,account_id,override_text,first_comment,scheduled_at_utc,jittered_at_utc,status,options_json) VALUES (?,?,?,?,?,?,?,?)',
    );
    for (const target of input.targets) {
      const status = target.status ?? input.status;
      const scheduled = target.scheduledAt ? new Date(target.scheduledAt) : null;
      if (scheduled && Number.isNaN(scheduled.getTime())) throw new Error('Invalid scheduled time');
      if (status === 'scheduled' && !scheduled) throw new Error('Scheduled targets require a date');
      insert.run(
        postId,
        target.accountId,
        target.overrideText ?? null,
        target.firstComment ?? null,
        scheduled?.toISOString() ?? null,
        scheduled ? jitterDate(scheduled, input.random).toISOString() : null,
        status,
        JSON.stringify(target.options ?? {}),
      );
    }
    if (input.media) {
      db.prepare('DELETE FROM media WHERE post_id=?').run(postId);
      const media = db.prepare(
        'INSERT INTO media(post_id,path,kind,width,height,duration_s,size_bytes,order_idx,alt_text) VALUES (?,?,?,?,?,?,?,?,?)',
      );
      input.media.forEach((item, index) =>
        media.run(
          postId,
          item.path,
          item.kind,
          item.width ?? null,
          item.height ?? null,
          item.durationS ?? null,
          item.sizeBytes ?? null,
          index,
          item.altText ?? null,
        ),
      );
    }
    return postId;
  })();
  if (input.targets.length) recalculatePostStatus(db, id);
  else db.prepare('UPDATE posts SET status=? WHERE id=?').run(input.status, id);
  return id;
}

/** `queue-post`: every target goes into its account's next free slot (default template if none set). */
export function queuePost(
  db: HandpostDatabase,
  input: Omit<SavePostInput, 'status' | 'targets'> & { targets: Array<Omit<TargetInput, 'scheduledAt'>> },
  from: Date = new Date(),
): number {
  return db.transaction(() => {
    // Resolve slots inside the transaction so two targets on one account never take the same slot.
    const targets = input.targets.map((target) => ({
      ...target,
      scheduledAt: nextQueueSlot(db, target.accountId, from).at,
    }));
    return savePost(db, { ...input, status: 'scheduled', targets });
  })();
}
