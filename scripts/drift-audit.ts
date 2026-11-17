/**
 * Drift audit (refinement loop, CODEX_HANDOFF §13.1): how old is each platform's DOM fixture, and did any live run
 * save a drift snapshot? Fixtures older than 30 days should be recaptured by the owner (`npm run capture`).
 *   npm run drift-audit
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86_400_000;
const fixtures = join('tests', 'fixtures');
const rows: Array<{ platform: string; updated: string; days: number; stale: boolean }> = [];
for (const platform of readdirSync(fixtures)) {
  const file = join(fixtures, platform, 'compose.html');
  if (!existsSync(file) || platform === 'example' || platform === 'inbox') continue;
  let updated = '';
  try {
    updated = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { encoding: 'utf8' }).trim();
  } catch {
    updated = '';
  }
  const days = updated ? Math.floor((Date.now() - Date.parse(updated)) / DAY) : Number.NaN;
  rows.push({ platform, updated: updated || 'uncommitted', days, stale: !(days <= 30) });
}
console.table(rows);
const drift = join(fixtures, '_drift');
const snapshots = existsSync(drift) ? readdirSync(drift).filter((name) => name.endsWith('.html')) : [];
if (snapshots.length)
  console.log(`Drift snapshots saved by live runs (repair these selectors): ${snapshots.join(', ')}`);
const stale = rows.filter((row) => row.stale).map((row) => row.platform);
console.log(
  stale.length
    ? `Recapture needed (> 30 days or uncommitted): ${stale.join(', ')}`
    : 'All platform fixtures are fresh (≤ 30 days).',
);
