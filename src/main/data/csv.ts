import type { HandpostDatabase } from '../db/database';
import { savePost } from '../posts/create';
import { nextFreeSlot } from '../scheduler/slots';
import type { CsvPlanRow } from '../../shared/rows';
export type { CsvPlanRow };
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"' && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += char;
  }
  values.push(value.trim());
  return values;
}
export function planCsvImport(db: HandpostDatabase, csv: string, from = new Date()): CsvPlanRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? '').map((v) => v.toLowerCase());
  const occupied = (
    db
      .prepare("SELECT scheduled_at_utc FROM post_targets WHERE status IN ('scheduled','publishing')")
      .pluck()
      .all() as string[]
  ).slice();
  return lines.filter(Boolean).map((line, index) => {
    const cells = parseCsvLine(line);
    const raw = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
    const text = raw.text ?? raw.base_text ?? '';
    const platform = raw.platform ?? '';
    const account = db.prepare('SELECT id FROM accounts WHERE platform=?').pluck().get(platform);
    if (typeof account !== 'number') throw new Error(`CSV row ${index + 2}: unknown platform ${platform}`);
    let scheduled: Date;
    if (raw.scheduled_at) {
      scheduled = new Date(raw.scheduled_at);
      if (Number.isNaN(scheduled.getTime())) throw new Error(`CSV row ${index + 2}: invalid scheduled_at`);
    } else {
      const slots = db
        .prepare('SELECT weekday,time_local AS timeLocal FROM queue_slots WHERE account_id=?')
        .all(account) as Array<{ weekday: number; timeLocal: string }>;
      const next = nextFreeSlot(slots, occupied, from);
      if (!next) throw new Error(`CSV row ${index + 2}: no queue slot available for ${platform}`);
      scheduled = next;
    }
    occupied.push(scheduled.toISOString());
    return { row: index + 2, text, platform, scheduledAt: scheduled.toISOString(), accountId: account };
  });
}
export function applyCsvImport(db: HandpostDatabase, rows: CsvPlanRow[]): void {
  db.transaction(() => {
    for (const row of rows)
      savePost(db, {
        text: row.text,
        status: 'scheduled',
        targets: [{ accountId: row.accountId, scheduledAt: row.scheduledAt }],
      });
  })();
}
