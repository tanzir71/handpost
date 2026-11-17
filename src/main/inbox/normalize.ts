/** Defaults, override mapping and the idempotency hash (INBOX_PROTOCOL §5, §7). */
import { createHash } from 'node:crypto';
import { OPTION_KEYS, type InboxPost } from '../../shared/inbox-schema';

export type SourceKind = 'claude' | 'codex' | 'git' | 'manual' | 'other';

export interface NormalizedTarget {
  platform: string;
  text: string;
  thread: string[];
  firstComment: string | null;
  /** Adapter option fields (camelCase), plus `threadParts` as JSON when the post has a thread. */
  options: Record<string, string | boolean>;
}

export interface NormalizedPost {
  id: string;
  text: string;
  when: string;
  mode: 'schedule' | 'review' | 'draft';
  onConflict: 'skip' | 'replace';
  source: string | null;
  sourceKind: SourceKind;
  labels: string[];
  media: Array<{ path: string; alt: string | null }>;
  targets: NormalizedTarget[];
  hash: string;
}

export function sourceKindOf(source: string | null | undefined): SourceKind {
  const tool = source?.split(':')[0];
  return tool === 'claude' || tool === 'codex' || tool === 'git' || tool === 'manual' ? tool : 'other';
}

/** JSON with object keys sorted at every level and line endings normalized, so equal posts hash equally. */
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (typeof item === 'string') return item.replace(/\r\n?/g, '\n');
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, sort((item as Record<string, unknown>)[key])]),
      );
    return item;
  };
  return JSON.stringify(sort(value));
}

/**
 * SHA-256 of the canonical post. `on_conflict` is excluded (it says how to treat a change, it is not the
 * change), and so is `handpost`, which is optional inside batches — the same post hashes the same whether it
 * arrives alone or in a batch.
 */
export function contentHash(post: Record<string, unknown>): string {
  const rest = { ...post };
  delete rest.on_conflict;
  delete rest.handpost;
  return createHash('sha256').update(canonicalJson(rest)).digest('hex');
}

export function normalizePost(post: InboxPost, defaultSource: string | null = null): NormalizedPost {
  const source = post.source ?? defaultSource;
  const targets = post.platforms.map((platform): NormalizedTarget => {
    const override = post.overrides?.[platform];
    const options: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(override?.options ?? {})) {
      const field = OPTION_KEYS[platform]?.[key];
      if (field && value !== undefined) options[field] = value;
    }
    const thread = override?.thread ?? [];
    if (thread.length) options.threadParts = JSON.stringify(thread);
    return {
      platform,
      text: override?.text ?? post.text,
      thread,
      firstComment: override?.first_comment ?? null,
      options,
    };
  });
  return {
    id: post.id,
    text: post.text,
    when: post.when ?? 'next-slot',
    mode: post.mode ?? 'schedule',
    onConflict: post.on_conflict ?? 'skip',
    source,
    sourceKind: sourceKindOf(source),
    labels: post.labels ?? [],
    media: (post.media ?? []).map((item) => ({ path: item.path, alt: item.alt ?? null })),
    targets,
    hash: contentHash(post as Record<string, unknown>),
  };
}
