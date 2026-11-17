/** Resolves an inbox `when` into a UTC instant per target (INBOX_PROTOCOL §6 step 9). */
import type { HandpostDatabase } from '../db/database';
import { nextQueueSlot } from '../posts/create';
import { zonedDateTimeToUtc } from '../scheduler/slots';
import type { InboxIssue } from '../../shared/inbox-schema';

export const LATE_GRACE_MS = 2 * 3_600_000;
export const NOW_DELAY_MS = 60_000;

export type TimeResolution =
  { ok: true; at: Date; warnings: InboxIssue[] } | { ok: false; issue: InboxIssue };

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** Parses an ISO time. Strings without an offset are wall-clock times in `timeZone`. */
export function parseWhen(value: string, timeZone: string): { at: Date; naive: boolean } | null {
  const naive = NAIVE.exec(value);
  if (naive) {
    const [, y, mo, d, h, mi, s = '0', ms = '0'] = naive;
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || Number(s) > 59)
      return null;
    const base = zonedDateTimeToUtc({ year: Number(y), month, day, hour, minute }, timeZone);
    return { at: new Date(base.getTime() + Number(s) * 1000 + Number(ms.padEnd(3, '0'))), naive: true };
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : { at, naive: false };
}

export interface ResolveTimeInput {
  when: string;
  platform: string;
  accountId: number;
  now: Date;
  timeZone: string;
}

export function resolveWhen(db: HandpostDatabase, input: ResolveTimeInput): TimeResolution {
  const { when, platform, accountId, now, timeZone } = input;
  const warnings: InboxIssue[] = [];
  if (when === 'now') return { ok: true, at: new Date(now.getTime() + NOW_DELAY_MS), warnings };
  if (when === 'next-slot') {
    const { at, usedDefault } = nextQueueSlot(db, accountId, now, timeZone);
    if (usedDefault)
      warnings.push({
        code: 'default_slots_used',
        platform,
        message: `${platform} has no queue slots; used the default 09:30 / 17:30 template`,
      });
    return { ok: true, at, warnings };
  }
  const parsed = parseWhen(when, timeZone);
  if (!parsed)
    return { ok: false, issue: { code: 'schema_invalid', message: `Invalid time ${when}`, path: '/when' } };
  if (parsed.naive)
    warnings.push({
      code: 'naive_time',
      platform,
      message: `${when} has no time zone offset; read as ${timeZone} time`,
    });
  const late = now.getTime() - parsed.at.getTime();
  if (late >= LATE_GRACE_MS)
    return {
      ok: false,
      issue: {
        code: 'stale_time',
        message: `${when} is ${Math.round(late / 60_000)} minutes in the past (limit 120)`,
        path: '/when',
      },
    };
  if (late > 0) {
    warnings.push({
      code: 'late',
      platform,
      message: `${when} was ${Math.max(1, Math.round(late / 60_000))} minutes ago; publishing in about a minute`,
    });
    return { ok: true, at: new Date(now.getTime() + NOW_DELAY_MS), warnings };
  }
  return { ok: true, at: parsed.at, warnings };
}

/** Local calendar day [start, end) in `timeZone` containing `at`, as UTC instants. */
export function localDayBounds(at: Date, timeZone: string): { start: Date; end: Date } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(at)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
  const start = zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0 }, timeZone);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = zonedDateTimeToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timeZone,
  );
  return { start, end };
}

export function dailyCap(db: HandpostDatabase, platform: string): number {
  const configured = db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(`dailyCap:${platform}`);
  const cap = Number(configured ?? 10);
  return Number.isFinite(cap) && cap > 0 ? cap : 10;
}

/** Targets on an account that are planned or done within the local day of `at`. */
export function plannedOnDay(db: HandpostDatabase, accountId: number, at: Date, timeZone: string): number {
  const { start, end } = localDayBounds(at, timeZone);
  return Number(
    db
      .prepare(
        "SELECT count(*) FROM post_targets WHERE account_id=? AND status IN ('scheduled','publishing','published') AND scheduled_at_utc>=? AND scheduled_at_utc<?",
      )
      .pluck()
      .get(accountId, start.toISOString(), end.toISOString()),
  );
}
