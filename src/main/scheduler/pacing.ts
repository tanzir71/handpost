/** Read models for the Queue screen's "Today's pacing" and "Circuit breakers" panels. */
import type { HandpostDatabase } from '../db/database';
import type { BreakerRow, PacingRow } from '../../shared/inbox-types';
import { dailyCap, localDayBounds } from '../inbox/resolve-time';

/** Minimum gap between two publishes to the same platform (the scheduler's cooldown). */
export function cooldownMs(platform: string): number {
  return (platform === 'instagram' ? 10 : 3) * 60_000;
}

export function pacingToday(
  db: HandpostDatabase,
  now: Date = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): PacingRow[] {
  const { start, end } = localDayBounds(now, timeZone);
  const accounts = db
    .prepare("SELECT id,platform,status FROM accounts WHERE platform<>'mock' ORDER BY id")
    .all() as Array<{
    id: number;
    platform: string;
    status: string;
  }>;
  const rows: PacingRow[] = [];
  for (const account of accounts) {
    const published = Number(
      db
        .prepare(
          "SELECT count(*) FROM publish_attempts pa JOIN post_targets t ON t.id=pa.target_id WHERE t.account_id=? AND pa.outcome='published' AND pa.finished_at>=? AND pa.finished_at<?",
        )
        .pluck()
        .get(account.id, start.toISOString(), end.toISOString()),
    );
    const planned = Number(
      db
        .prepare(
          "SELECT count(*) FROM post_targets WHERE account_id=? AND status IN ('scheduled','publishing') AND scheduled_at_utc>=? AND scheduled_at_utc<?",
        )
        .pluck()
        .get(account.id, start.toISOString(), end.toISOString()),
    );
    if (account.status !== 'ok' && !published && !planned) continue;
    const latest = db
      .prepare(
        "SELECT max(pa.finished_at) FROM publish_attempts pa JOIN post_targets t ON t.id=pa.target_id WHERE t.account_id=? AND pa.outcome='published'",
      )
      .pluck()
      .get(account.id) as string | null;
    const until = latest ? new Date(new Date(latest).getTime() + cooldownMs(account.platform)) : null;
    rows.push({
      platform: account.platform,
      published,
      planned,
      cap: dailyCap(db, account.platform),
      cooldownUntil: until && until > now ? until.toISOString() : null,
    });
  }
  return rows;
}

export function breakerRows(db: HandpostDatabase, now: Date = new Date()): BreakerRow[] {
  const rows = db.prepare("SELECT key,value FROM settings WHERE key LIKE 'breaker:%:until'").all() as Array<{
    key: string;
    value: string;
  }>;
  return rows
    .map((row) => {
      const platform = row.key.slice('breaker:'.length, -':until'.length);
      let events: string[] = [];
      try {
        events = JSON.parse(
          String(
            db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(`breaker:${platform}`) ?? '[]',
          ),
        );
      } catch {
        events = [];
      }
      return { platform, until: row.value, events, manual: row.value === 'manual' };
    })
    .filter((row) => row.manual || new Date(row.until) > now);
}
