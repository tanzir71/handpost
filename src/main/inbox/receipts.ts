/** Receipts (`receipts/<id>.json`) and the status snapshot (`handpost.status.json`), INBOX_PROTOCOL §8–9. */
import { capabilities } from '../../shared/capabilities';
import { INBOX_PLATFORMS, PROTOCOL_VERSION, type InboxItemState } from '../../shared/inbox-schema';
import type { PlatformId } from '../../shared/types';
import type { Receipt, ReceiptTarget } from '../../shared/inbox-types';
import type { HandpostDatabase } from '../db/database';
import { nextQueueSlots } from '../posts/create';
import { CircuitBreaker } from '../scheduler/circuit-breaker';
import { dailyCap, localDayBounds } from './resolve-time';
import { parseIssues, type InboxItemRow } from './store';

/** `2026-11-20T03:30:00.000Z` → `2026-11-20T03:30:00Z`; SQLite `CURRENT_TIMESTAMP` → ISO with Z. */
export function isoSeconds(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : value;
  const date = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export type { Receipt, ReceiptTarget };

interface TargetDetail {
  id: number;
  platform: string;
  status: string;
  scheduled_at_utc: string | null;
  published_url: string | null;
  error_code: string | null;
  error_detail: string | null;
  published_at: string | null;
  error_class: string | null;
}

export function targetsOf(db: HandpostDatabase, postId: number): TargetDetail[] {
  return db
    .prepare(
      `SELECT t.id,a.platform,t.status,t.scheduled_at_utc,t.published_url,t.error_code,t.error_detail,
         (SELECT max(finished_at) FROM publish_attempts pa WHERE pa.target_id=t.id AND pa.outcome='published') AS published_at,
         (SELECT error_class FROM publish_attempts pa WHERE pa.target_id=t.id ORDER BY pa.id DESC LIMIT 1) AS error_class
       FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE t.post_id=? ORDER BY t.id`,
    )
    .all(postId) as TargetDetail[];
}

const ACTIVE = ['scheduled', 'publishing'];

/**
 * The item's state as writers see it. Rows that never became a post keep their stored state; for posts the
 * targets decide, except that all-draft targets keep the item `held` or `draft`.
 */
export function effectiveState(stored: InboxItemState, statuses: string[]): InboxItemState {
  if (['waiting_media', 'rejected', 'duplicate'].includes(stored) || !statuses.length) return stored;
  const live = statuses.filter((status) => status !== 'cancelled');
  if (!live.length) return 'cancelled';
  if (live.every((status) => status === 'draft')) return stored === 'draft' ? 'draft' : 'held';
  const published = live.filter((status) => status === 'published').length;
  if (published === statuses.length) return 'published';
  if (live.some((status) => status === 'publishing')) return 'publishing';
  if (live.some((status) => ACTIVE.includes(status) || status === 'draft')) return 'scheduled';
  return published > 0 ? 'partial' : 'failed';
}

function errorClassFor(detail: TargetDetail): string {
  if (detail.error_class) return detail.error_class;
  if (detail.status === 'needs_login') return 'session';
  if (detail.error_code === 'invalid_content') return 'content';
  return 'transient';
}

export function buildReceipt(db: HandpostDatabase, item: InboxItemRow): Receipt {
  const targets = item.post_id ? targetsOf(db, item.post_id) : [];
  const state = effectiveState(
    item.state,
    targets.map((target) => target.status),
  );
  const receipt: Receipt = {
    handpost: PROTOCOL_VERSION,
    id: item.id,
    state,
    source: item.source,
    file: item.stored_path,
    received_at: isoSeconds(item.received_at) ?? isoSeconds(new Date())!,
    updated_at: isoSeconds(item.updated_at) ?? isoSeconds(new Date())!,
    mode: item.mode,
    warnings: parseIssues(item.warnings_json),
    errors: parseIssues(item.errors_json),
    targets: targets.map((target) => ({
      platform: target.platform,
      status: target.status,
      scheduled_at: isoSeconds(target.scheduled_at_utc),
      published_at: target.status === 'published' ? isoSeconds(target.published_at) : null,
      url: target.published_url,
      error:
        target.error_code && target.status !== 'published' && target.status !== 'cancelled'
          ? {
              code: target.error_code,
              class: errorClassFor(target),
              message: target.error_detail ?? target.error_code,
            }
          : null,
    })),
  };
  if (item.replaced_at) receipt.replaced_at = isoSeconds(item.replaced_at)!;
  return receipt;
}

export interface StatusOptions {
  appVersion: string;
  timeZone: string;
  now: Date;
  autoSchedule: boolean;
  previews: boolean;
  allowOutsideMedia: boolean;
  /** Platforms to report; defaults to the nine protocol platforms. */
  platforms?: readonly string[];
}

export interface StatusPlatform {
  connected: boolean;
  status: string;
  handle: string | null;
  daily_cap: number;
  scheduled_today: number;
  frozen_until: string | null;
  next_free_slots: string[];
  limits: { max_chars: number; max_media: number; media_kinds: string[]; threads: boolean };
}

export interface StatusFile {
  handpost: 1;
  app_version: string;
  generated_at: string;
  alive_until: string;
  timezone: string;
  inbox: {
    auto_schedule: boolean;
    accepts: string[];
    accepts_versions: number[];
    max_file_kb: number;
    media_outside_inbox: boolean;
  };
  platforms: Record<string, StatusPlatform>;
  upcoming: Array<{ id: string; platforms: string[]; scheduled_at: string; state: string; preview?: string }>;
  recent: Array<{
    id: string;
    platform: string;
    status: string;
    published_at: string | null;
    url: string | null;
  }>;
}

const DAY = 86_400_000;

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

export function buildStatus(db: HandpostDatabase, options: StatusOptions): StatusFile {
  const { now, timeZone } = options;
  const breaker = new CircuitBreaker(db);
  const platforms: Record<string, StatusPlatform> = {};
  const today = localDayBounds(now, timeZone);
  for (const platform of options.platforms ?? INBOX_PLATFORMS) {
    const account = db.prepare('SELECT id,status,handle FROM accounts WHERE platform=?').get(platform) as
      { id: number; status: string; handle: string | null } | undefined;
    const cap = capabilities[platform as PlatformId];
    if (!account || !cap) continue;
    const until = db
      .prepare('SELECT value FROM settings WHERE key=?')
      .pluck()
      .get(`breaker:${platform}:until`);
    const frozen = breaker.isOpen(platform, now);
    const status = frozen ? 'frozen' : account.status === 'unknown' ? 'not_connected' : account.status;
    platforms[platform] = {
      connected: account.status === 'ok' || (frozen && account.status === 'frozen'),
      status,
      handle: account.handle,
      daily_cap: dailyCap(db, platform),
      scheduled_today: Number(
        db
          .prepare(
            "SELECT count(*) FROM post_targets WHERE account_id=? AND status IN ('scheduled','publishing','published') AND scheduled_at_utc>=? AND scheduled_at_utc<?",
          )
          .pluck()
          .get(account.id, today.start.toISOString(), today.end.toISOString()),
      ),
      frozen_until: frozen ? (until === 'manual' ? 'manual' : isoSeconds(String(until))) : null,
      next_free_slots: frozen
        ? []
        : nextQueueSlots(db, account.id, 3, now, timeZone).map((date) => isoSeconds(date)!),
      limits: {
        max_chars: cap.maxChars,
        max_media: cap.maxMedia,
        media_kinds: [...cap.mediaKinds],
        threads: Boolean(cap.supportsThreads),
      },
    };
  }
  const horizon = new Date(now.getTime() + 14 * DAY).toISOString();
  const since = new Date(now.getTime() - 14 * DAY).toISOString();
  const upcomingRows = db
    .prepare(
      `SELECT p.id AS post_id,p.base_text,min(t.scheduled_at_utc) AS scheduled_at,group_concat(a.platform) AS platforms,
         i.id AS inbox_id,i.state AS inbox_state
       FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN accounts a ON a.id=t.account_id
       LEFT JOIN inbox_items i ON i.post_id=p.id
       WHERE t.status IN ('scheduled','publishing','draft') AND t.scheduled_at_utc IS NOT NULL
         AND t.scheduled_at_utc>=? AND t.scheduled_at_utc<=?
       GROUP BY p.id ORDER BY scheduled_at LIMIT 100`,
    )
    .all(new Date(now.getTime() - 2 * 3_600_000).toISOString(), horizon) as Array<{
    post_id: number;
    base_text: string;
    scheduled_at: string;
    platforms: string;
    inbox_id: string | null;
    inbox_state: InboxItemState | null;
  }>;
  const upcoming = upcomingRows.map((row) => {
    const statuses = db
      .prepare('SELECT status FROM post_targets WHERE post_id=?')
      .pluck()
      .all(row.post_id) as string[];
    const state = row.inbox_state
      ? effectiveState(row.inbox_state, statuses)
      : effectiveState('scheduled', statuses);
    return {
      id: row.inbox_id ?? `app-${row.post_id}`,
      platforms: row.platforms.split(','),
      scheduled_at: isoSeconds(row.scheduled_at)!,
      state,
      ...(options.previews ? { preview: preview(row.base_text) } : {}),
    };
  });
  const recentRows = db
    .prepare(
      `SELECT t.post_id,a.platform,t.status,t.published_url,i.id AS inbox_id,
         (SELECT max(pa.finished_at) FROM publish_attempts pa WHERE pa.target_id=t.id) AS finished_at,
         (SELECT max(pa.finished_at) FROM publish_attempts pa WHERE pa.target_id=t.id AND pa.outcome='published') AS published_at
       FROM post_targets t JOIN accounts a ON a.id=t.account_id LEFT JOIN inbox_items i ON i.post_id=t.post_id
       WHERE t.status NOT IN ('scheduled','publishing','draft','cancelled','rehearsal')
         AND EXISTS (SELECT 1 FROM publish_attempts pa WHERE pa.target_id=t.id AND pa.finished_at>=?)
       ORDER BY finished_at DESC LIMIT 100`,
    )
    .all(since) as Array<{
    post_id: number;
    platform: string;
    status: string;
    published_url: string | null;
    inbox_id: string | null;
    published_at: string | null;
  }>;
  const recent = recentRows.map((row) => ({
    id: row.inbox_id ?? `app-${row.post_id}`,
    platform: row.platform,
    status: row.status,
    published_at: row.status === 'published' ? isoSeconds(row.published_at) : null,
    url: row.published_url,
  }));
  return {
    handpost: PROTOCOL_VERSION,
    app_version: options.appVersion,
    generated_at: isoSeconds(now)!,
    alive_until: isoSeconds(new Date(now.getTime() + 10 * 60_000))!,
    timezone: timeZone,
    inbox: {
      auto_schedule: options.autoSchedule,
      accepts: ['md', 'json'],
      accepts_versions: [PROTOCOL_VERSION],
      max_file_kb: 256,
      media_outside_inbox: options.allowOutsideMedia,
    },
    platforms,
    upcoming,
    recent,
  };
}

export type ItemWithReceipt = InboxItemRow & { receipt: Receipt };
