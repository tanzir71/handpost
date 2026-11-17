import { afterEach, describe, expect, it } from 'vitest';
import { auditInbox } from '../../../src/main/inbox/audit';
import { recalculatePostStatus } from '../../../src/main/scheduler/status';
import { createHarness, type Harness } from './helpers';

/** Small seeded PRNG so a failing run can be replayed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLATFORMS = ['x', 'linkedin', 'bluesky', 'threads', 'mock'];
const WEIRD: unknown[] = [
  null,
  0,
  -1,
  Number.MAX_VALUE,
  true,
  '',
  ' ',
  '😀'.repeat(300),
  'x'.repeat(5000),
  [],
  [[[[[]]]]],
  {},
  { a: { b: { c: { d: {} } } } },
  '2026-02-30T25:61',
  'next-slot ',
  '../../etc/passwd',
  '\u0000‮',
];

let h: Harness;
afterEach(async () => {
  await h?.cleanup();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('inbox fuzzing', () => {
  it('never throws, never posts an id twice, and never pollutes prototypes on 150 mutated files', async () => {
    h = createHarness();
    const random = mulberry32(20261118);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
    const ids = Array.from({ length: 12 }, (_, index) => `fuzz-${index}`);
    for (let index = 0; index < 150; index++) {
      const post: Record<string, unknown> = {
        handpost: 1,
        id: pick(ids),
        platforms: [pick(PLATFORMS)],
        text: `Fuzz post ${Math.floor(random() * 3)}`,
        when: pick(['next-slot', 'now', '2026-11-20T09:30:00Z']),
      };
      const mutations = Math.floor(random() * 3);
      for (let m = 0; m < mutations; m++) {
        const key = pick([
          'handpost',
          'id',
          'platforms',
          'text',
          'when',
          'mode',
          'overrides',
          'labels',
          'extra',
          '__proto__',
          'constructor',
        ]);
        if (random() < 0.3) delete post[key];
        else if (key === '__proto__')
          Object.defineProperty(post, '__proto__', { value: { polluted: true }, enumerable: true });
        else post[key] = pick(WEIRD);
      }
      if (random() < 0.15) post.on_conflict = 'replace';
      const asMarkdown = random() < 0.4;
      let content: string;
      if (asMarkdown) {
        const { text, ...front } = post;
        const yaml = Object.entries(front)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');
        content = `---\n${yaml}\n${random() < 0.1 ? '__proto__: {polluted: true}\n' : ''}---\n${String(text ?? '')}\n`;
      } else
        content =
          random() < 0.1 ? JSON.stringify({ handpost: 1, posts: [post, post] }) : JSON.stringify(post);
      h.drop(`f-${index}${asMarkdown ? '.md' : '.json'}`, content);
    }
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.inboxFiles()).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const owned = h.db
      .prepare(
        'SELECT post_id,count(*) AS n FROM inbox_items WHERE post_id IS NOT NULL GROUP BY post_id HAVING n>1',
      )
      .all();
    expect(owned).toEqual([]);
    // Every post created by the inbox belongs to exactly one id; no stray posts.
    expect(h.count('SELECT count(*) FROM posts')).toBe(
      h.count('SELECT count(*) FROM inbox_items WHERE post_id IS NOT NULL'),
    );
    expect(h.count('SELECT count(*) FROM posts')).toBeLessThanOrEqual(ids.length);
    expect(auditInbox(h.db, h.root)).toEqual([]);
  }, 60_000);
});

describe('receipt/state consistency', () => {
  it('holds across accept, duplicate, replace, approve, reject, publish, fail and cancel', async () => {
    h = createHarness({ autoSchedule: false });
    // Like the running app: the service listens for post changes made elsewhere (scheduler, IPC).
    await h.service.start();
    const random = mulberry32(7);
    const drop = (name: string, value: Record<string, unknown>) =>
      h.drop(name, JSON.stringify({ handpost: 1, ...value }));
    for (let round = 0; round < 6; round++) {
      const id = `audit-${round}`;
      drop(`${id}.json`, {
        id,
        platforms: ['x', 'bluesky'],
        text: `Round ${round}`,
        mode: round % 2 ? 'review' : 'schedule',
      });
      await h.run();
      drop(`${id}-dup.json`, {
        id,
        platforms: ['x', 'bluesky'],
        text: `Round ${round}`,
        mode: round % 2 ? 'review' : 'schedule',
      });
      drop(`${id}-replace.json`, {
        id,
        platforms: ['x'],
        text: `Round ${round} edited`,
        on_conflict: 'replace',
      });
      await h.run();
      const choice = random();
      if (choice < 0.4) await h.service.approve(id);
      else if (choice < 0.6) await h.service.reject(id);
      const postId = h.db.prepare('SELECT post_id FROM inbox_items WHERE id=?').pluck().get(id) as number;
      const scheduled = h.db
        .prepare("SELECT id FROM post_targets WHERE post_id=? AND status='scheduled'")
        .pluck()
        .all(postId) as number[];
      for (const targetId of scheduled) {
        const outcome = random() < 0.5 ? 'published' : 'failed';
        h.db
          .prepare('UPDATE post_targets SET status=?,published_url=? WHERE id=?')
          .run(outcome, outcome === 'published' ? `https://x.com/a/status/${targetId}` : null, targetId);
        h.db
          .prepare(
            "INSERT INTO publish_attempts(target_id,started_at,finished_at,outcome,step_log_json) VALUES (?,'2026-11-18T03:00:00Z','2026-11-18T03:01:00Z',?,'[]')",
          )
          .run(targetId, outcome);
        recalculatePostStatus(h.db, postId);
      }
      if (random() < 0.3) {
        drop(`cancel-${id}.json`, { id, action: 'cancel' });
        await h.run();
      }
      await wait(120);
      await h.service.idle();
    }
    expect(auditInbox(h.db, h.root)).toEqual([]);
    expect(h.count('SELECT count(*) FROM inbox_items')).toBe(6);
  }, 60_000);

  it('reports drift when a receipt is stale, missing or orphaned', async () => {
    h = createHarness();
    h.drop('a.json', JSON.stringify({ handpost: 1, id: 'drift', platforms: ['x'], text: 'Drift' }));
    await h.run();
    expect(auditInbox(h.db, h.root)).toEqual([]);
    h.db.prepare("UPDATE post_targets SET status='published'").run(); // changed behind the service's back
    h.drop('../receipts/orphan.json', '{}');
    const problems = auditInbox(h.db, h.root).map((issue) => issue.problem);
    expect(problems).toEqual(
      expect.arrayContaining([
        'stored state scheduled but targets say published',
        'receipt says scheduled, database says published',
        'receipt without an inbox item',
      ]),
    );
  });
});
