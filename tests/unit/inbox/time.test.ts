import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/db/database';
import { parseWhen, resolveWhen } from '../../../src/main/inbox/resolve-time';

function setup(slots: Array<[number, string]> = []) {
  const db = openDatabase();
  db.prepare(
    "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('x','X','x','ok')",
  ).run();
  for (const [weekday, time] of slots)
    db.prepare('INSERT INTO queue_slots(account_id,weekday,time_local) VALUES (1,?,?)').run(weekday, time);
  return db;
}
const now = new Date('2026-11-18T03:00:00Z'); // Wednesday
const resolve = (db: ReturnType<typeof setup>, when: string, timeZone = 'UTC', at = now) =>
  resolveWhen(db, { when, platform: 'x', accountId: 1, now: at, timeZone });

describe('inbox time resolution', () => {
  it('uses an ISO time with offset or Z exactly', () => {
    const db = setup();
    const offset = resolve(db, '2026-11-20T09:30:00+06:00');
    expect(offset.ok && offset.at.toISOString()).toBe('2026-11-20T03:30:00.000Z');
    expect(offset.ok && offset.warnings).toEqual([]);
    const zulu = resolve(db, '2026-11-20T03:30Z');
    expect(zulu.ok && zulu.at.toISOString()).toBe('2026-11-20T03:30:00.000Z');
  });
  it('reads a naive time in the Handpost time zone and warns naive_time', () => {
    const db = setup();
    const result = resolve(db, '2026-11-20T09:30', 'Asia/Dhaka');
    expect(result.ok && result.at.toISOString()).toBe('2026-11-20T03:30:00.000Z');
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['naive_time']);
  });
  it('schedules now as now + 60 s', () => {
    const result = resolve(setup(), 'now');
    expect(result.ok && result.at.toISOString()).toBe('2026-11-18T03:01:00.000Z');
  });
  it('uses the next free configured slot for next-slot', () => {
    const db = setup([[4, '10:00']]); // Thursday 10:00 UTC
    const result = resolve(db, 'next-slot');
    expect(result.ok && result.at.toISOString()).toBe('2026-11-19T10:00:00.000Z');
    expect(result.ok && result.warnings).toEqual([]);
    db.prepare("INSERT INTO posts(base_text,status) VALUES ('taken','scheduled')").run();
    db.prepare(
      "INSERT INTO post_targets(post_id,account_id,scheduled_at_utc,jittered_at_utc,status) VALUES (1,1,'2026-11-19T10:00:00.000Z','2026-11-19T10:00:30.000Z','scheduled')",
    ).run();
    const next = resolve(db, 'next-slot');
    expect(next.ok && next.at.toISOString()).toBe('2026-11-26T10:00:00.000Z');
  });
  it('falls back to the 09:30 / 17:30 default template with default_slots_used', () => {
    const result = resolve(setup(), 'next-slot');
    expect(result.ok && result.at.toISOString()).toBe('2026-11-18T09:30:00.000Z');
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['default_slots_used']);
  });
  it('accepts a time less than two hours late as now + 60 s with warning late', () => {
    const result = resolve(setup(), '2026-11-18T01:30:00Z');
    expect(result.ok && result.at.toISOString()).toBe('2026-11-18T03:01:00.000Z');
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['late']);
  });
  it('rejects a time two or more hours in the past as stale_time', () => {
    const result = resolve(setup(), '2026-11-18T01:00:00Z');
    expect(!result.ok && result.issue.code).toBe('stale_time');
  });
  it('handles the Europe/London DST boundary', () => {
    // Clocks went forward on 2026-03-29 at 01:00 UTC.
    expect(parseWhen('2026-03-28T09:30', 'Europe/London')!.at.toISOString()).toBe('2026-03-28T09:30:00.000Z');
    expect(parseWhen('2026-03-29T09:30', 'Europe/London')!.at.toISOString()).toBe('2026-03-29T08:30:00.000Z');
    // Back on 2026-10-25.
    expect(parseWhen('2026-10-24T09:30', 'Europe/London')!.at.toISOString()).toBe('2026-10-24T08:30:00.000Z');
    expect(parseWhen('2026-10-25T09:30', 'Europe/London')!.at.toISOString()).toBe('2026-10-25T09:30:00.000Z');
  });
  it('handles the America/New_York DST boundary, including next-slot across it', () => {
    expect(parseWhen('2026-03-07T09:30', 'America/New_York')!.at.toISOString()).toBe(
      '2026-03-07T14:30:00.000Z',
    );
    expect(parseWhen('2026-03-08T09:30', 'America/New_York')!.at.toISOString()).toBe(
      '2026-03-08T13:30:00.000Z',
    );
    expect(parseWhen('2026-10-31T09:30', 'America/New_York')!.at.toISOString()).toBe(
      '2026-10-31T13:30:00.000Z',
    );
    expect(parseWhen('2026-11-01T09:30', 'America/New_York')!.at.toISOString()).toBe(
      '2026-11-01T14:30:00.000Z',
    );
    const db = setup([[0, '09:30']]); // Sundays 09:30 New York time
    const result = resolve(db, 'next-slot', 'America/New_York', new Date('2026-10-31T20:00:00Z'));
    expect(result.ok && result.at.toISOString()).toBe('2026-11-01T14:30:00.000Z');
  });
});
