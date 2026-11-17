import type { HandpostDatabase } from '../db/database';
import { jitterDate } from '../engine/humanizer';
import { recalculatePostStatus } from '../scheduler/status';

const STALE_MS = 2 * 3_600_000;

/**
 * After the owner logs in again, posts that stopped at `needs_login` go back into the queue. A post whose time is
 * more than two hours past is never published late without a look: it becomes `needs_attention: overdue`, the same
 * rule as for posts missed while the app was closed. Returns the number of targets re-queued.
 */
export function resumeAfterLogin(db: HandpostDatabase, platform: string, now: Date = new Date()): number {
  const rows = db
    .prepare(
      "SELECT t.id,t.post_id,t.scheduled_at_utc FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE a.platform=? AND t.status='needs_login'",
    )
    .all(platform) as Array<{ id: number; post_id: number; scheduled_at_utc: string | null }>;
  let resumed = 0;
  const soon = new Date(now.getTime() + 60_000);
  for (const row of rows) {
    const planned = row.scheduled_at_utc ? new Date(row.scheduled_at_utc) : soon;
    if (now.getTime() - planned.getTime() >= STALE_MS) {
      db.prepare(
        "UPDATE post_targets SET status='needs_attention',error_code='overdue',error_detail=? WHERE id=?",
      ).run(
        'More than two hours late after logging in again; reschedule or retry it from the Queue.',
        row.id,
      );
    } else {
      const at = planned < soon ? soon : planned;
      db.prepare(
        "UPDATE post_targets SET status='scheduled',jittered_at_utc=?,error_code=NULL,error_detail=NULL WHERE id=?",
      ).run(jitterDate(at).toISOString(), row.id);
      resumed++;
    }
  }
  for (const postId of new Set(rows.map((row) => row.post_id))) recalculatePostStatus(db, postId);
  return resumed;
}
