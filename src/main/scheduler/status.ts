import type { HandpostDatabase } from '../db/database';
import { postEvents } from '../posts/events';

const STUCK = ['failed', 'needs_login', 'needs_attention', 'manual', 'unverified'];

/** Derives a post's status from its targets' statuses. */
export function derivePostStatus(statuses: string[]): string | null {
  if (!statuses.length) return null;
  if (statuses.every((value) => value === 'rehearsal')) return 'rehearsal';
  const live = statuses.filter((value) => value !== 'cancelled');
  if (!live.length) return 'cancelled';
  if (live.every((value) => value === 'draft')) return 'draft';
  if (live.every((value) => value === 'published'))
    return statuses.length === live.length ? 'published' : 'partial';
  if (live.some((value) => value === 'published')) return 'partial';
  if (live.every((value) => STUCK.includes(value))) return 'failed';
  if (live.some((value) => value === 'publishing')) return 'publishing';
  return 'scheduled';
}

export function recalculatePostStatus(db: HandpostDatabase, postId: number): void {
  const statuses = db
    .prepare('SELECT status FROM post_targets WHERE post_id=?')
    .pluck()
    .all(postId) as string[];
  const status = derivePostStatus(statuses);
  if (status)
    db.prepare('UPDATE posts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, postId);
  postEvents.emitChanged(postId);
}
