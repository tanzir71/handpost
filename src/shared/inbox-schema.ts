/**
 * Handpost inbox protocol v1 — the zod source of truth for `schema/handpost-post.v1.schema.json`.
 * Normative spec: docs/INBOX_PROTOCOL.md. Changing what this accepts is a protocol change (see §13).
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const INBOX_PLATFORMS = [
  'x',
  'linkedin',
  'bluesky',
  'threads',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'pinterest',
] as const;
export type InboxPlatform = (typeof INBOX_PLATFORMS)[number];

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_BATCH_POSTS = 50;
export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
export const WHEN_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
export const SOURCE_PATTERN = /^[a-z0-9-]+(:[A-Za-z0-9._-]+)?$/;
export const LABEL_PATTERN = /^[a-z0-9-]{1,32}$/;

export const INBOX_ERROR_CODES = [
  'parse_error',
  'too_large',
  'unsupported_version',
  'schema_invalid',
  'content_invalid',
  'media_missing',
  'media_outside_root',
  'media_unsupported',
  'media_too_large',
  'stale_time',
  'duplicate_id',
  'already_publishing',
  'unknown_id',
  'internal_error',
] as const;
export type InboxErrorCode = (typeof INBOX_ERROR_CODES)[number];

/** Warnings never reject an item. Capability warnings get their own codes (e.g. `text_folds`). */
export const INBOX_WARNING_CODES = [
  'naive_time',
  'late',
  'default_slots_used',
  'over_daily_cap',
  'platform_not_connected',
  'platform_frozen',
  'text_folds',
  'near_limit',
  'media_cropped',
  'partially_published',
] as const;
export type InboxWarningCode = (typeof INBOX_WARNING_CODES)[number];

export interface InboxIssue {
  code: string;
  message: string;
  /** JSON pointer into the post object, e.g. `/media/0/path`. */
  path?: string;
  platform?: string;
}

/** Item states written to receipts (`state`). */
export const INBOX_ITEM_STATES = [
  'waiting_media',
  'held',
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
  'cancelled',
  'rejected',
  'duplicate',
] as const;
export type InboxItemState = (typeof INBOX_ITEM_STATES)[number];

/** Per-platform option keys (snake_case in files) and the adapter option field each maps to. */
export const OPTION_KEYS: Record<string, Record<string, string>> = {
  facebook: { page_name: 'pageName' },
  tiktok: { cover_time: 'coverTime' },
  youtube: { title: 'title', visibility: 'visibility', made_for_kids: 'madeForKids' },
  pinterest: { title: 'title', destination_url: 'destinationUrl', board: 'board' },
};
export const ALL_OPTION_KEYS = [
  'page_name',
  'cover_time',
  'title',
  'visibility',
  'made_for_kids',
  'destination_url',
  'board',
] as const;
export const FIRST_COMMENT_PLATFORMS = ['x', 'linkedin', 'threads', 'facebook', 'mock'];
export const THREAD_PLATFORMS = ['x', 'mock'];

const id = z.string().regex(ID_PATTERN, 'must match ^[a-z0-9][a-z0-9._-]{0,79}$');
const when = z.union([z.literal('now'), z.literal('next-slot'), z.string().regex(WHEN_PATTERN)]);
const mediaItem = z
  .object({ path: z.string().min(1).max(1024), alt: z.string().max(2000).optional() })
  .strict();
const mediaList = z.array(mediaItem).max(10);
const optionValue = z.union([z.string(), z.boolean()]);
const options = z
  .object(
    Object.fromEntries(ALL_OPTION_KEYS.map((key) => [key, optionValue.optional()])) as Record<
      (typeof ALL_OPTION_KEYS)[number],
      z.ZodOptional<typeof optionValue>
    >,
  )
  .strict();
const override = z
  .object({
    text: z.string().max(100_000).optional(),
    thread: z.array(z.string().min(1).max(100_000)).max(24).optional(),
    first_comment: z.string().max(10_000).optional(),
    options: options.optional(),
  })
  .strict();

function unique<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

/** Builds the protocol schemas. `platforms` defaults to the nine real ones; tests and the dev smoke add `mock`. */
const version = z.literal(PROTOCOL_VERSION);

export function inboxSchemas(platforms: readonly string[] = INBOX_PLATFORMS) {
  const platform = z.enum(platforms as [string, ...string[]]);
  const postShape = {
    handpost: version.optional(),
    id,
    action: z.literal('upsert').optional(),
    platforms: z.array(platform).min(1).max(9).refine(unique, 'platforms must be unique'),
    text: z.string().max(100_000),
    when: when.optional(),
    mode: z.enum(['schedule', 'review', 'draft']).optional(),
    media: mediaList.optional(),
    overrides: z.record(platform, override).optional(),
    labels: z
      .array(z.string().regex(LABEL_PATTERN))
      .max(10)
      .refine(unique, 'labels must be unique')
      .optional(),
    source: z.string().max(120).regex(SOURCE_PATTERN).optional(),
    on_conflict: z.enum(['skip', 'replace']).optional(),
  };
  const post = z.object(postShape).strict();
  const topPost = post.extend({ handpost: version }).strict();
  const batch = z.object({ handpost: version, posts: z.array(post).min(1).max(MAX_BATCH_POSTS) }).strict();
  const cancel = z.object({ handpost: version, id, action: z.literal('cancel') }).strict();
  return {
    platform,
    post,
    topPost,
    batch,
    cancel,
    file: z.union([topPost, batch, cancel]),
    /** Named parts, so the generated JSON Schema can reference them from `$defs`. */
    parts: { version, id, platform, when, media: mediaList, override, options },
  };
}
export const defaultInboxSchemas = inboxSchemas();
export type InboxPost = z.infer<typeof defaultInboxSchemas.post>;
export type InboxBatch = z.infer<typeof defaultInboxSchemas.batch>;
export type InboxCancel = z.infer<typeof defaultInboxSchemas.cancel>;
export type InboxOverride = NonNullable<InboxPost['overrides']>[string];

/** `["media", 0, "path"]` → `/media/0/path` (RFC 6901 escaping). */
export function jsonPointer(path: ReadonlyArray<string | number>): string {
  return path.map((part) => `/${String(part).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

/** Turns zod issues into protocol issues, unwrapping union errors to the most specific branch. */
export function zodIssues(error: z.ZodError, prefix: ReadonlyArray<string | number> = []): InboxIssue[] {
  const issues: InboxIssue[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'invalid_union' && issue.unionErrors.length) {
      // Pick the branch that got furthest (fewest issues) so `platform:` typos are reported plainly.
      const best = [...issue.unionErrors].sort((a, b) => a.issues.length - b.issues.length)[0]!;
      issues.push(...zodIssues(best, prefix));
      continue;
    }
    const path = [...prefix, ...issue.path];
    let message = issue.message;
    if (issue.code === 'unrecognized_keys') message = `Unknown field(s): ${issue.keys.join(', ')}`;
    if (issue.code === 'invalid_type' && issue.received === 'undefined') message = 'Required';
    issues.push({ code: 'schema_invalid', message, path: jsonPointer(path) });
  }
  return issues;
}

/**
 * Cross-field rules JSON Schema cannot express: override keys must be targeted platforms, thread and
 * first_comment only where the platform supports them, option keys only where the platform has them.
 */
export function crossFieldIssues(post: InboxPost, prefix: ReadonlyArray<string | number> = []): InboxIssue[] {
  const issues: InboxIssue[] = [];
  for (const [platform, value] of Object.entries(post.overrides ?? {})) {
    const at = (...rest: Array<string | number>) => jsonPointer([...prefix, 'overrides', platform, ...rest]);
    if (!post.platforms.includes(platform))
      issues.push({
        code: 'schema_invalid',
        message: `Override for ${platform}, which is not in platforms`,
        path: at(),
        platform,
      });
    if (value.thread && !THREAD_PLATFORMS.includes(platform))
      issues.push({
        code: 'schema_invalid',
        message: `thread is only supported for x`,
        path: at('thread'),
        platform,
      });
    if (value.first_comment !== undefined && !FIRST_COMMENT_PLATFORMS.includes(platform))
      issues.push({
        code: 'schema_invalid',
        message: `first_comment is only supported for x, linkedin, threads and facebook`,
        path: at('first_comment'),
        platform,
      });
    for (const key of Object.keys(value.options ?? {}))
      if (!OPTION_KEYS[platform]?.[key])
        issues.push({
          code: 'schema_invalid',
          message: `Unknown option ${key} for ${platform}`,
          path: at('options', key),
          platform,
        });
  }
  return issues;
}
