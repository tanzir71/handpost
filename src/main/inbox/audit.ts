/**
 * Receipt/state consistency audit (H10). Checks the invariants writers rely on, so drift between the database and
 * the files in the Handpost folder is found by a test or a startup self-check rather than by a confused writer.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HandpostDatabase } from '../db/database';
import { buildReceipt, effectiveState, targetsOf } from './receipts';
import type { InboxItemRow } from './store';

export interface AuditIssue {
  id: string;
  problem: string;
}

/**
 * - every item that became a post has exactly one item row (no post is owned twice);
 * - the stored state equals the state derived from the targets;
 * - the receipt on disk exists, parses, and matches what the database says (state, targets, statuses);
 * - no receipt on disk lacks an item row;
 * - a post never has more than one target per platform.
 */
export function auditInbox(
  db: HandpostDatabase,
  root: string,
  options: { receipts?: boolean } = {},
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const items = db.prepare('SELECT * FROM inbox_items').all() as InboxItemRow[];
  const owners = new Map<number, string>();
  for (const item of items) {
    if (item.post_id) {
      const other = owners.get(item.post_id);
      if (other) issues.push({ id: item.id, problem: `post ${item.post_id} is also owned by ${other}` });
      owners.set(item.post_id, item.id);
      const targets = targetsOf(db, item.post_id);
      const platforms = targets.map((target) => target.platform);
      if (new Set(platforms).size !== platforms.length)
        issues.push({ id: item.id, problem: `duplicate platform targets: ${platforms.join(',')}` });
      const derived = effectiveState(
        item.state,
        targets.map((target) => target.status),
      );
      if (derived !== item.state)
        issues.push({ id: item.id, problem: `stored state ${item.state} but targets say ${derived}` });
    }
    if (options.receipts === false) continue;
    const path = join(root, 'receipts', `${item.id}.json`);
    if (!existsSync(path)) {
      issues.push({ id: item.id, problem: 'receipt file is missing' });
      continue;
    }
    let onDisk: { state?: string; targets?: Array<{ platform: string; status: string; url: string | null }> };
    try {
      onDisk = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      issues.push({ id: item.id, problem: 'receipt file is not valid JSON' });
      continue;
    }
    const expected = buildReceipt(db, item);
    if (onDisk.state !== expected.state)
      issues.push({ id: item.id, problem: `receipt says ${onDisk.state}, database says ${expected.state}` });
    const summary = (targets: Array<{ platform: string; status: string; url: string | null }> | undefined) =>
      JSON.stringify((targets ?? []).map((target) => [target.platform, target.status, target.url]));
    if (summary(onDisk.targets) !== summary(expected.targets))
      issues.push({ id: item.id, problem: 'receipt targets differ from the database' });
  }
  if (options.receipts !== false && existsSync(join(root, 'receipts'))) {
    const known = new Set(items.map((item) => item.id));
    for (const name of readdirSync(join(root, 'receipts')))
      if (name.endsWith('.json') && !name.startsWith('.') && !known.has(name.slice(0, -5)))
        issues.push({ id: name.slice(0, -5), problem: 'receipt without an inbox item' });
  }
  return issues;
}
