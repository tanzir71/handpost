/**
 * InboxService — watches the Handpost folder and turns post files into scheduled posts, receipts and a status
 * file, implementing docs/INBOX_PROTOCOL.md. Every step runs through one serial queue (concurrency 1).
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import PQueue from 'p-queue';
import { z } from 'zod';
import {
  ID_PATTERN,
  INBOX_PLATFORMS,
  MAX_BATCH_POSTS,
  PROTOCOL_VERSION,
  crossFieldIssues,
  inboxSchemas,
  jsonPointer,
  zodIssues,
  type InboxIssue,
  type InboxItemState,
  type InboxPost,
} from '../../shared/inbox-schema';
import type { HandpostDatabase } from '../db/database';
import type { InboxHealth, InboxListItem, WriterRow } from '../../shared/inbox-types';
import { jitterDate } from '../engine/humanizer';
import { postEvents } from '../posts/events';
import { savePost, type TargetInput } from '../posts/create';
import { recalculatePostStatus } from '../scheduler/status';
import { atomicWrite, safeMove, uniqueName } from './fsx';
import {
  copyIntoStore,
  isInside,
  MEDIA_WAIT_MS,
  normalizeMediaPath,
  resolveMedia,
  type ResolvedMedia,
} from './media';
import { normalizePost, sourceKindOf, type NormalizedPost } from './normalize';
import { parseInboxFile } from './parse';
import { ensureLayout, isIgnoredDirectory, isIgnoredPath, layoutOf, type HandpostLayout } from './paths';
import { buildReceipt, buildStatus, effectiveState, isoSeconds, targetsOf, type Receipt } from './receipts';
import { dailyCap, plannedOnDay, resolveWhen } from './resolve-time';
import { InboxStore, parseIssues, TERMINAL_STATES, type InboxItemRow } from './store';
import { accountFor, accountWarnings, validateContent } from './validate';

export const SETTING_KEYS = {
  path: 'inbox.path',
  autoSchedule: 'inbox.autoSchedule',
  writeStatus: 'inbox.writeStatus',
  statusPreviews: 'inbox.statusPreviews',
  allowOutsideMedia: 'inbox.allowOutsideMedia',
} as const;

const RECEIPT_RETENTION_MS = 90 * 86_400_000;

/** An additional read-only inbox root (H9 remote Git source): files are never moved, state lives in the DB. */
export interface ExtraRoot {
  name: string;
  inbox: string;
  defaultSource: string;
}

export interface InboxServiceOptions {
  db: HandpostDatabase;
  /** The Handpost folder (default ~/Handpost). */
  root: string;
  /** Where accepted media is copied (the app's managed media store). */
  mediaStore: string;
  appVersion: string;
  timeZone?: string;
  now?: () => Date;
  /** Accepted platform ids. Defaults to the nine protocol platforms; dev/test may add `mock`. */
  platforms?: readonly string[];
  notify?: (title: string, body: string) => void;
  /** Use a file-system watcher in addition to the periodic rescan (off in tests). */
  watch?: boolean;
  settleMs?: number;
  rescanMs?: number;
  statusDebounceMs?: number;
  statusIntervalMs?: number;
  mediaWaitMs?: number;
  /** Files written into the Handpost folder on first run (README.txt is always written). */
  layoutFiles?: Record<string, string>;
  extraRoots?: () => ExtraRoot[];
  /** Test seam: runs right after a post's DB commit and before its file is moved. */
  afterCommit?: (id: string) => void | Promise<void>;
  /** Test seam: observes processing start/end. */
  onProcess?: (event: 'start' | 'end', file: string) => void;
}

interface FileContext {
  /** Absolute path of the file being processed. */
  path: string;
  /** Path relative to the inbox root, forward slashes. */
  rel: string;
  fileName: string;
  rootName: string;
  /** Root for media containment. */
  inboxRoot: string;
  defaultSource: string | null;
  move: boolean;
  receivedAt: string;
}

type PostOutcome =
  | { kind: 'accepted'; id: string; media: ResolvedMedia[]; state: InboxItemState }
  | { kind: 'duplicate'; id: string }
  | { kind: 'waiting'; id: string }
  | {
      kind: 'rejected';
      id: string | null;
      issues: InboxIssue[];
      recordable: boolean;
      source?: string | null;
    };

const fileHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const syntheticId = (hash: string) => `file-${hash.slice(0, 12)}`;
const validId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);
const toPosix = (path: string) => path.split(sep).join('/');
/** Background timers must never keep a test run or a quitting app alive. */
function unref<T extends ReturnType<typeof setTimeout>>(timer: T): T {
  (timer as { unref?: () => void }).unref?.();
  return timer;
}

export class InboxService extends EventEmitter {
  readonly store: InboxStore;
  private layout: HandpostLayout;
  private readonly queue = new PQueue({ concurrency: 1 });
  private readonly schemas: ReturnType<typeof inboxSchemas>;
  private readonly firstSeen = new Map<string, string>();
  private readonly platforms: readonly string[];
  private readonly timeZone: string;
  private readonly now: () => Date;
  private readonly settleMs: number;
  private readonly mediaWaitMs: number;
  private readonly seen = new Map<string, { size: number; mtimeMs: number; since: number }>();
  private readonly queued = new Set<string>();
  private watcher: { close(): Promise<void> } | null = null;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private receiptTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribe: (() => void) | null = null;
  private lastScanAt: string | null = null;
  private lastError: string | null = null;
  private lastPrune = 0;
  private heldNotice: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly options: InboxServiceOptions) {
    super();
    this.store = new InboxStore(options.db);
    this.layout = layoutOf(options.root);
    this.platforms = options.platforms ?? INBOX_PLATFORMS;
    this.schemas = inboxSchemas(this.platforms);
    this.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.now = options.now ?? (() => new Date());
    this.settleMs = options.settleMs ?? 2000;
    this.mediaWaitMs = options.mediaWaitMs ?? MEDIA_WAIT_MS;
  }

  get folder(): string {
    return this.layout.root;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      ensureLayout(this.layout.root, this.options.layoutFiles);
    } catch (error) {
      this.lastError = `Cannot create ${this.layout.root}: ${(error as Error).message}`;
    }
    this.unsubscribe = postEvents.onChanged((postId) => this.onPostChanged(postId));
    if (this.options.watch !== false) await this.startWatcher();
    this.timers.push(setInterval(() => void this.rescan(), this.options.rescanMs ?? 60_000));
    this.timers.push(setInterval(() => void this.writeStatusNow(), this.options.statusIntervalMs ?? 300_000));
    await this.rescan();
    await this.writeStatusNow();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    for (const timer of [this.settleTimer, this.statusTimer, this.heldNotice]) if (timer) clearTimeout(timer);
    for (const timer of this.receiptTimers.values()) clearTimeout(timer);
    this.receiptTimers.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.watcher?.close().catch(() => undefined);
    this.watcher = null;
    await this.queue.onIdle();
  }

  /** Points the service at a different Handpost folder (Settings → Automation → Change…). */
  async setFolder(root: string): Promise<void> {
    const wasRunning = this.running;
    if (wasRunning) await this.stop();
    this.layout = layoutOf(root);
    this.seen.clear();
    this.lastError = null;
    if (wasRunning) await this.start();
  }

  /** Resolves when every queued file and action has been handled. */
  async idle(): Promise<void> {
    await this.queue.onIdle();
  }

  private async startWatcher(): Promise<void> {
    try {
      const { watch } = await import('chokidar');
      const watcher = watch(this.layout.inbox, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 250 },
        ignored: (path: string) => basename(path).startsWith('.') && path !== this.layout.inbox,
      });
      const hint = () => this.scheduleScan(250);
      watcher.on('add', hint).on('change', hint);
      watcher.on('error', (error) => {
        this.lastError = `Watcher: ${error instanceof Error ? error.message : String(error)}`;
      });
      this.watcher = watcher;
    } catch (error) {
      this.lastError = `Watcher unavailable: ${(error as Error).message}`;
    }
  }

  private scheduleScan(delayMs: number): void {
    if (this.settleTimer || !this.running) return;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      void this.rescan();
    }, delayMs);
  }

  // ── settings ─────────────────────────────────────────────────────────────────────────────────────────

  private setting(key: string, fallback: boolean): boolean {
    const value = this.options.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key);
    return value === undefined ? fallback : value === 'true';
  }

  /** Off until the owner confirms the trust-boundary explanation (D9). */
  get autoSchedule(): boolean {
    return this.setting(SETTING_KEYS.autoSchedule, false);
  }

  private get writeOutputs(): boolean {
    return this.setting(SETTING_KEYS.writeStatus, true);
  }

  // ── discovery ────────────────────────────────────────────────────────────────────────────────────────

  private roots(): Array<{ name: string; inbox: string; defaultSource: string | null; move: boolean }> {
    return [
      { name: 'local', inbox: this.layout.inbox, defaultSource: null, move: true },
      ...(this.options.extraRoots?.() ?? []).map((root) => ({
        name: root.name,
        inbox: root.inbox,
        defaultSource: root.defaultSource,
        move: false,
      })),
    ];
  }

  private async walk(dir: string, base: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDirectory(entry.name)) await this.walk(path, base, out);
      } else if (entry.isFile() && !isIgnoredPath(relative(base, path))) out.push(path);
    }
  }

  /** Candidate post files currently in an inbox root (ignore rules applied). */
  async candidates(inbox: string = this.layout.inbox): Promise<string[]> {
    const files: string[] = [];
    await this.walk(inbox, inbox, files);
    return files;
  }

  /**
   * Full rescan (startup, every 60 s, on resume, on watcher hints). Files are processed once their size and
   * mtime have been unchanged for `settleMs`.
   */
  async rescan(): Promise<void> {
    if (!existsSync(this.layout.root)) {
      this.lastError = `Handpost folder is missing: ${this.layout.root}`;
      this.emit('changed');
      return;
    }
    try {
      ensureLayout(this.layout.root, this.options.layoutFiles);
      const found: Array<{ path: string; mtimeMs: number; root: ReturnType<InboxService['roots']>[number] }> =
        [];
      let unsettled = false;
      const nowMs = Date.now();
      const live = new Set<string>();
      for (const root of this.roots()) {
        for (const path of await this.candidates(root.inbox)) {
          live.add(path);
          let info;
          try {
            info = await stat(path);
          } catch {
            continue;
          }
          const previous = this.seen.get(path);
          if (!previous || previous.size !== info.size || previous.mtimeMs !== info.mtimeMs) {
            this.seen.set(path, { size: info.size, mtimeMs: info.mtimeMs, since: nowMs });
            if (this.settleMs > 0) {
              unsettled = true;
              continue;
            }
          } else if (nowMs - previous.since < this.settleMs) {
            unsettled = true;
            continue;
          }
          found.push({ path, mtimeMs: info.mtimeMs, root });
        }
      }
      for (const path of this.seen.keys()) if (!live.has(path)) this.seen.delete(path);
      found.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path));
      for (const { path, root } of found) {
        if (this.queued.has(path)) continue;
        this.queued.add(path);
        void this.queue.add(async () => {
          try {
            await this.processFile(path, root);
          } finally {
            this.queued.delete(path);
          }
        });
      }
      if (unsettled) this.scheduleScan(this.settleMs + 100);
      this.lastScanAt = new Date().toISOString();
      if (this.lastError?.startsWith('Handpost folder') || this.lastError?.startsWith('Scan'))
        this.lastError = null;
      await this.pruneReceipts();
    } catch (error) {
      this.lastError = `Scan failed: ${(error as Error).message}`;
    }
    this.emit('changed');
  }

  // ── processing ───────────────────────────────────────────────────────────────────────────────────────

  private async processFile(
    path: string,
    root: { name: string; inbox: string; defaultSource: string | null; move: boolean },
  ): Promise<void> {
    this.options.onProcess?.('start', path);
    try {
      await this.processFileUnsafe(path, root);
    } catch (error) {
      // Nothing escapes the service: an unexpected failure rejects the file with internal_error.
      this.lastError = `${basename(path)}: ${(error as Error).message}`;
      try {
        if (existsSync(path) && root.move)
          await this.rejectFile(this.context(path, root), null, [
            { code: 'internal_error', message: (error as Error).message },
          ]);
      } catch {
        // Leave the file for the next scan.
      }
    } finally {
      this.options.onProcess?.('end', path);
      this.emit('changed');
    }
  }

  private context(
    path: string,
    root: { name: string; inbox: string; defaultSource: string | null; move: boolean },
  ): FileContext {
    return {
      path,
      rel: toPosix(relative(root.inbox, path)),
      fileName: basename(path),
      rootName: root.name,
      inboxRoot: root.inbox,
      defaultSource: root.defaultSource,
      move: root.move,
      receivedAt: this.now().toISOString(),
    };
  }

  private async processFileUnsafe(
    path: string,
    root: { name: string; inbox: string; defaultSource: string | null; move: boolean },
  ): Promise<void> {
    const ctx = this.context(path, root);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch {
      return; // Gone already (moved by the writer or a previous run).
    }
    const hash = fileHash(bytes);
    // Read-only roots: a file whose exact bytes were already handled is skipped (state lives in the DB).
    if (!root.move && this.store.seenFile(hash, ctx.rel, root.name)) return;
    const parsed = parseInboxFile(ctx.fileName, bytes);
    if (!parsed.ok) return this.finishRejected(ctx, null, [parsed.issue], hash);
    const value = parsed.value;
    const declaredId = validId(value.id) ? value.id : null;
    if ('handpost' in value && value.handpost !== PROTOCOL_VERSION)
      return this.finishRejected(
        ctx,
        declaredId,
        [
          {
            code: 'unsupported_version',
            message: `handpost: ${JSON.stringify(value.handpost)} is not supported; this Handpost reads version 1`,
            path: '/handpost',
          },
        ],
        hash,
      );
    if (!('handpost' in value))
      return this.finishRejected(
        ctx,
        declaredId,
        [{ code: 'schema_invalid', message: 'Required: handpost: 1', path: '/handpost' }],
        hash,
      );

    if ('posts' in value) return this.processBatch(ctx, value, hash);
    if (value.action === 'cancel') return this.processCancel(ctx, value, hash);

    const outcome = await this.processPost(ctx, value, []);
    await this.finishFile(ctx, [outcome], hash);
  }

  private async processBatch(ctx: FileContext, value: Record<string, unknown>, hash: string): Promise<void> {
    const envelope = z
      .object({
        handpost: z.literal(PROTOCOL_VERSION),
        posts: z.array(z.unknown()).min(1).max(MAX_BATCH_POSTS),
      })
      .strict()
      .safeParse(value);
    if (!envelope.success) return this.finishRejected(ctx, null, zodIssues(envelope.error), hash);
    const outcomes: PostOutcome[] = [];
    for (const [index, raw] of envelope.data.posts.entries())
      outcomes.push(await this.processPost(ctx, raw, ['posts', index]));
    await this.finishFile(ctx, outcomes, hash);
  }

  private async processCancel(ctx: FileContext, value: Record<string, unknown>, hash: string): Promise<void> {
    const parsed = this.schemas.cancel.safeParse(value);
    const declaredId = validId(value.id) ? value.id : null;
    if (!parsed.success) return this.finishRejected(ctx, declaredId, zodIssues(parsed.error), hash);
    const id = parsed.data.id;
    const item = this.store.get(id);
    if (!item || (!item.post_id && item.state !== 'waiting_media'))
      return this.finishRejected(
        ctx,
        id,
        [{ code: 'unknown_id', message: `No post with id ${id}`, path: '/id' }],
        hash,
      );
    const db = this.options.db;
    if (!item.post_id) {
      this.store.setState(id, 'cancelled');
    } else {
      const published = Number(
        db
          .prepare(
            "SELECT count(*) FROM post_targets WHERE post_id=? AND status IN ('published','publishing')",
          )
          .pluck()
          .get(item.post_id),
      );
      db.prepare(
        "UPDATE post_targets SET status='cancelled',error_code=NULL,error_detail=NULL WHERE post_id=? AND status NOT IN ('published','publishing','cancelled')",
      ).run(item.post_id);
      if (published) {
        const warnings = parseIssues(item.warnings_json).filter(
          (issue) => issue.code !== 'partially_published',
        );
        warnings.push({
          code: 'partially_published',
          message: 'Cancelled the remaining platforms; some were already published',
        });
        this.store.setState(id, item.state, { warnings });
      }
      recalculatePostStatus(db, item.post_id);
    }
    const stored = await this.moveAccepted(ctx);
    this.store.logFile({
      itemId: id,
      fileName: ctx.fileName,
      storedPath: stored,
      source: item.source,
      outcome: 'cancel',
      contentHash: hash,
      root: ctx.rootName,
    });
    await this.refreshItem(id);
    this.scheduleStatus();
  }

  /** Steps 4–12 for one post. Never throws for content problems; returns a rejection instead. */
  private async processPost(
    ctx: FileContext,
    raw: unknown,
    prefix: Array<string | number>,
  ): Promise<PostOutcome> {
    const declaredId =
      raw && typeof raw === 'object' && validId((raw as Record<string, unknown>).id)
        ? ((raw as Record<string, unknown>).id as string)
        : null;
    const declaredSource =
      raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).source === 'string'
        ? ((raw as Record<string, unknown>).source as string)
        : ctx.defaultSource;
    const reject = (issues: InboxIssue[], recordable = true): PostOutcome => ({
      kind: 'rejected',
      id: declaredId,
      issues,
      recordable,
      source: declaredSource,
    });
    const schema = prefix.length ? this.schemas.post : this.schemas.topPost;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return reject(zodIssues(parsed.error, prefix));
    const post = parsed.data as InboxPost;
    const cross = crossFieldIssues(post, prefix);
    if (cross.length) return reject(cross);
    const normalized = normalizePost(post, ctx.defaultSource);
    const id = normalized.id;
    const db = this.options.db;

    // 6. Idempotency.
    const existing = this.store.get(id);
    const replaceable =
      existing && !existing.post_id && ['rejected', 'waiting_media'].includes(existing.state);
    let replacing: InboxItemRow | undefined;
    if (existing && !replaceable) {
      if (existing.content_hash === normalized.hash) return { kind: 'duplicate', id };
      if (normalized.onConflict === 'skip')
        return reject(
          [
            {
              code: 'duplicate_id',
              message: `${id} already exists with different content; use on_conflict: replace to change it`,
              path: jsonPointer([...prefix, 'id']),
            },
          ],
          false,
        );
      if (existing.post_id) {
        const busy = Number(
          db
            .prepare(
              "SELECT count(*) FROM post_targets WHERE post_id=? AND status IN ('publishing','published')",
            )
            .pluck()
            .get(existing.post_id),
        );
        if (busy)
          return reject(
            [{ code: 'already_publishing', message: `${id} is already publishing or published` }],
            false,
          );
      }
      replacing = existing;
    }

    // 7. Media.
    const clockKey = `${ctx.path}:${normalized.hash}`;
    if (!this.firstSeen.has(clockKey)) this.firstSeen.set(clockKey, ctx.receivedAt);
    const firstSeen =
      existing?.state === 'waiting_media' && existing.content_hash === normalized.hash
        ? existing.first_seen_at
        : this.firstSeen.get(clockKey)!;
    const media = await resolveMedia(normalized.media, {
      baseDir: dirname(ctx.path),
      inboxRoot: ctx.inboxRoot,
      allowOutside: this.setting(SETTING_KEYS.allowOutsideMedia, false),
    });
    if (media.state === 'rejected')
      return reject(
        media.issues.map((issue) => ({ ...issue, path: `${jsonPointer(prefix)}${issue.path ?? ''}` })),
      );
    if (media.state === 'waiting') {
      const waited = this.now().getTime() - new Date(firstSeen).getTime();
      if (waited >= this.mediaWaitMs)
        return reject(
          media.missing.map((path) => ({
            code: 'media_missing',
            message: `${path} was not found after ${Math.round(this.mediaWaitMs / 60_000)} minutes`,
            path: jsonPointer([
              ...prefix,
              'media',
              normalized.media.findIndex((m) => normalizeMediaPath(m.path) === path),
              'path',
            ]),
          })),
        );
      if (!replacing) {
        this.store.upsert({
          id,
          postId: null,
          source: normalized.source,
          sourceKind: normalized.sourceKind,
          fileName: ctx.fileName,
          storedPath: null,
          contentHash: normalized.hash,
          state: 'waiting_media',
          mode: normalized.mode,
          warnings: [],
          errors: media.missing.map((path) => ({ code: 'media_missing', message: `Waiting for ${path}` })),
          firstSeenAt: firstSeen,
          receivedAt: ctx.receivedAt,
          root: ctx.rootName,
        });
        await this.refreshItem(id);
      }
      return { kind: 'waiting', id };
    }

    // 8. Content.
    const content = validateContent(normalized, media.items);
    if (content.errors.length) return reject(content.errors);

    // 10. Accounts (before time so warnings read in protocol order of importance).
    const accounts = new Map<string, number>();
    for (const target of normalized.targets) {
      const account = accountFor(db, target.platform);
      if (!account)
        return reject([{ code: 'internal_error', message: `No account row for ${target.platform}` }]);
      accounts.set(target.platform, account.id);
    }
    const warnings: InboxIssue[] = [
      ...content.warnings,
      ...accountWarnings(
        db,
        normalized.targets.map((t) => t.platform),
      ),
    ];

    // 11. Decide state.
    const state: InboxItemState =
      normalized.mode === 'draft'
        ? 'draft'
        : normalized.mode === 'review' || !this.autoSchedule
          ? 'held'
          : 'scheduled';

    // 9. Time (drafts are never scheduled, so they carry no time).
    const now = this.now();
    const times = new Map<string, Date | null>();
    for (const target of normalized.targets) {
      if (state === 'draft') {
        times.set(target.platform, null);
        continue;
      }
      const accountId = accounts.get(target.platform)!;
      const resolved = resolveWhen(db, {
        when: normalized.when,
        platform: target.platform,
        accountId,
        now,
        timeZone: this.timeZone,
      });
      if (!resolved.ok)
        return reject([{ ...resolved.issue, path: `${jsonPointer(prefix)}${resolved.issue.path ?? ''}` }]);
      warnings.push(...resolved.warnings);
      const cap = dailyCap(db, target.platform);
      if (plannedOnDay(db, accountId, resolved.at, this.timeZone) >= cap)
        warnings.push({
          code: 'over_daily_cap',
          platform: target.platform,
          message: `${target.platform} already has ${cap} posts that day; the scheduler will defer this one`,
        });
      times.set(target.platform, resolved.at);
    }

    // 12. Commit (media copies first, then one transaction).
    const storeDir = join(this.options.mediaStore, 'inbox', `${id}-${normalized.hash.slice(0, 8)}`);
    const copies = media.items.length ? await copyIntoStore(media.items, storeDir) : [];
    try {
      db.transaction(() => {
        const targets: TargetInput[] = normalized.targets.map((target) => ({
          accountId: accounts.get(target.platform)!,
          scheduledAt: times.get(target.platform) ?? null,
          overrideText: target.text === normalized.text ? null : target.text,
          firstComment: target.firstComment,
          options: target.options,
          status: state === 'scheduled' ? 'scheduled' : 'draft',
        }));
        const postId = savePost(db, {
          id: replacing?.post_id ?? undefined,
          text: normalized.text,
          status: state === 'scheduled' ? 'scheduled' : 'draft',
          labels: normalized.labels,
          targets,
          media: media.items.map((item, index) => ({
            path: copies[index]!,
            kind: item.kind,
            width: item.width ?? null,
            height: item.height ?? null,
            durationS: item.durationS ?? null,
            sizeBytes: item.sizeBytes,
            altText: item.alt,
          })),
          replace: replacing ? 'all' : 'unsent',
        });
        this.store.upsert({
          id,
          postId,
          source: normalized.source,
          sourceKind: normalized.sourceKind,
          fileName: ctx.fileName,
          storedPath: null,
          contentHash: normalized.hash,
          state,
          mode: normalized.mode,
          warnings,
          errors: [],
          firstSeenAt: firstSeen,
          receivedAt: replacing ? replacing.received_at : ctx.receivedAt,
          replacedAt: replacing ? ctx.receivedAt : null,
          root: ctx.rootName,
        });
      })();
    } catch (error) {
      await rm(storeDir, { recursive: true, force: true });
      throw error;
    }
    await this.options.afterCommit?.(id);
    return { kind: 'accepted', id, media: media.items, state };
  }

  // ── file outcomes ────────────────────────────────────────────────────────────────────────────────────

  private async finishFile(ctx: FileContext, outcomes: PostOutcome[], hash: string): Promise<void> {
    if (outcomes.some((outcome) => outcome.kind === 'waiting')) {
      // Leave the file in the inbox; committed siblings become harmless duplicates on the next pass.
      for (const outcome of outcomes) if (outcome.kind === 'accepted') await this.refreshItem(outcome.id);
      this.scheduleStatus();
      return;
    }
    const kept = outcomes.filter((outcome) => outcome.kind === 'accepted' || outcome.kind === 'duplicate');
    const rejected = outcomes.filter(
      (outcome): outcome is Extract<PostOutcome, { kind: 'rejected' }> => outcome.kind === 'rejected',
    );
    if (!kept.length) {
      const issues = rejected.flatMap((outcome) => outcome.issues);
      const single = outcomes.length === 1 ? (rejected[0]?.id ?? null) : null;
      await this.rejectFile(ctx, single, issues, hash, rejected);
      return;
    }
    const stored = await this.moveAccepted(ctx);
    const accepted = outcomes.filter(
      (outcome): outcome is Extract<PostOutcome, { kind: 'accepted' }> => outcome.kind === 'accepted',
    );
    if (ctx.move)
      await this.moveMedia(
        ctx,
        accepted.flatMap((outcome) => outcome.media),
      );
    for (const outcome of outcomes) {
      if (outcome.kind === 'duplicate' && !this.store.get(outcome.id)?.stored_path) {
        // Crash recovery: the post was committed but the file never moved; record where it went now.
        this.options.db.prepare('UPDATE inbox_items SET stored_path=? WHERE id=?').run(stored, outcome.id);
        await this.refreshItem(outcome.id);
      }
      if (outcome.kind === 'accepted') {
        this.options.db
          .prepare('UPDATE inbox_items SET stored_path=?,file_name=? WHERE id=?')
          .run(stored, ctx.fileName, outcome.id);
        await this.refreshItem(outcome.id);
      }
      if (outcome.kind === 'rejected')
        await this.recordRejection(
          ctx,
          outcome.id,
          outcome.issues,
          stored,
          outcome.recordable,
          hash,
          outcome.source,
        );
      this.store.logFile({
        itemId: outcome.id,
        fileName: ctx.fileName,
        storedPath: stored,
        source: outcome.kind === 'accepted' ? (this.store.get(outcome.id)?.source ?? null) : null,
        outcome: outcome.kind,
        contentHash: hash,
        errors: outcome.kind === 'rejected' ? outcome.issues : [],
        root: ctx.rootName,
      });
    }
    if (rejected.length)
      this.notify(
        `${rejected.map((outcome) => outcome.id ?? ctx.fileName).join(', ')} rejected: ${rejected[0]!.issues[0]?.code ?? 'rejected'}`,
        rejected[0]!.issues[0]?.message ?? 'See the receipt for details.',
      );
    const held = outcomes.filter((outcome) => outcome.kind === 'accepted' && outcome.state === 'held').length;
    if (held) this.noticeHeld();
    this.scheduleStatus();
  }

  private async finishRejected(
    ctx: FileContext,
    id: string | null,
    issues: InboxIssue[],
    hash: string,
  ): Promise<void> {
    await this.rejectFile(ctx, id, issues, hash);
  }

  /** Moves the file to rejected/ with an .error.json and records receipts for rejected ids. */
  private async rejectFile(
    ctx: FileContext,
    id: string | null,
    issues: InboxIssue[],
    hash = '',
    perPost?: Array<{ id: string | null; issues: InboxIssue[]; recordable: boolean; source?: string | null }>,
  ): Promise<void> {
    let stored: string | null = null;
    if (ctx.move) {
      const name = await uniqueName(this.layout.rejected, ctx.fileName);
      const target = join(this.layout.rejected, name);
      await safeMove(ctx.path, target);
      stored = `rejected/${name}`;
      await atomicWrite(
        `${target}.error.json`,
        `${JSON.stringify(
          {
            handpost: PROTOCOL_VERSION,
            file: `inbox/${ctx.rel}`,
            id,
            received_at: isoSeconds(ctx.receivedAt),
            errors: issues,
          },
          null,
          2,
        )}\n`,
      );
    } else stored = toPosix(relative(this.layout.root, ctx.path));
    const fallbackHash = hash || fileHash(Buffer.from(ctx.path));
    const targets = perPost ?? [{ id, issues, recordable: true, source: ctx.defaultSource }];
    for (const entry of targets) {
      // A file that names no usable id is recorded under file-<sha12> (only when it holds one post).
      const recordId = entry.id ?? (targets.length === 1 ? syntheticId(fallbackHash) : null);
      await this.recordRejection(
        ctx,
        recordId,
        entry.issues,
        stored,
        entry.recordable,
        hash,
        entry.source ?? null,
      );
      this.store.logFile({
        itemId: recordId,
        fileName: ctx.fileName,
        storedPath: stored,
        source: null,
        outcome: 'rejected',
        contentHash: hash,
        errors: entry.issues,
        root: ctx.rootName,
      });
    }
    const first = issues[0]?.code ?? 'rejected';
    this.notify(
      `${id ?? ctx.fileName} rejected: ${first}`,
      issues[0]?.message ?? 'See the rejected folder for details.',
    );
    this.scheduleStatus();
  }

  /**
   * Writes a `rejected` item + receipt for an id — unless that id belongs to a live post (a rejected
   * replacement must not overwrite the receipt of the post that is still scheduled).
   */
  private async recordRejection(
    ctx: FileContext,
    id: string | null,
    issues: InboxIssue[],
    stored: string | null,
    recordable: boolean,
    hash: string,
    source: string | null = null,
  ): Promise<void> {
    if (!id || !recordable) return;
    const existing = this.store.get(id);
    if (existing && (existing.post_id || !['rejected', 'waiting_media'].includes(existing.state))) return;
    this.store.upsert({
      id,
      postId: null,
      source,
      sourceKind: sourceKindOf(source),
      fileName: ctx.fileName,
      storedPath: stored,
      contentHash: hash || 'unknown',
      state: 'rejected',
      mode: 'schedule',
      warnings: [],
      errors: issues,
      firstSeenAt: existing?.first_seen_at ?? ctx.receivedAt,
      receivedAt: ctx.receivedAt,
      root: ctx.rootName,
    });
    await this.refreshItem(id);
  }

  private async moveAccepted(ctx: FileContext): Promise<string> {
    if (!ctx.move) return toPosix(relative(this.layout.root, ctx.path));
    const month = this.now().toISOString().slice(0, 7);
    const dir = join(this.layout.processed, month);
    const name = await uniqueName(dir, ctx.fileName);
    await safeMove(ctx.path, join(dir, name));
    return `processed/${month}/${name}`;
  }

  /** Moves referenced media to processed/YYYY-MM/media/ unless another unprocessed file still uses it. */
  private async moveMedia(ctx: FileContext, items: ResolvedMedia[]): Promise<void> {
    if (!items.length) return;
    const stillReferenced = await this.referencedByOthers(ctx.path);
    const month = this.now().toISOString().slice(0, 7);
    const dir = join(this.layout.processed, month, 'media');
    const moved = new Set<string>();
    for (const item of items) {
      const key = item.referenced.toLowerCase();
      if (moved.has(key) || stillReferenced.has(key)) continue;
      if (!existsSync(item.referenced)) continue;
      // Only media inside the inbox moves; opted-in outside media stays where the owner keeps it.
      if (!isInside(this.layout.inbox, item.referenced)) continue;
      moved.add(key);
      await safeMove(item.referenced, join(dir, await uniqueName(dir, basename(item.referenced))));
    }
  }

  private async referencedByOthers(except: string): Promise<Set<string>> {
    const references = new Set<string>();
    for (const file of await this.candidates()) {
      if (file === except) continue;
      try {
        const parsed = parseInboxFile(basename(file), await readFile(file));
        if (!parsed.ok) continue;
        const posts = Array.isArray(parsed.value.posts) ? parsed.value.posts : [parsed.value];
        for (const post of posts) {
          const media = (post as { media?: unknown }).media;
          if (!Array.isArray(media)) continue;
          for (const entry of media) {
            const path = (entry as { path?: unknown }).path;
            if (typeof path === 'string')
              references.add(join(dirname(file), normalizeMediaPath(path)).toLowerCase());
          }
        }
      } catch {
        // Unreadable files cannot reference anything.
      }
    }
    return references;
  }

  // ── receipts & status ────────────────────────────────────────────────────────────────────────────────

  /** Recomputes the item's effective state, persists it and rewrites its receipt. */
  async refreshItem(id: string): Promise<Receipt | null> {
    const item = this.store.get(id);
    if (!item) return null;
    const statuses = item.post_id
      ? targetsOf(this.options.db, item.post_id).map((target) => target.status)
      : [];
    const state = effectiveState(item.state, statuses);
    if (state !== item.state) this.store.setState(id, state);
    const fresh = this.store.get(id)!;
    const receipt = buildReceipt(this.options.db, fresh);
    if (this.writeOutputs) {
      try {
        await atomicWrite(join(this.layout.receipts, `${id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
      } catch (error) {
        this.lastError = `Receipt ${id}: ${(error as Error).message}`;
      }
    }
    this.emit('changed');
    return receipt;
  }

  private onPostChanged(postId: number): void {
    const item = this.store.byPost(postId);
    if (!item) {
      this.scheduleStatus();
      return;
    }
    const existing = this.receiptTimers.get(item.id);
    if (existing) clearTimeout(existing);
    this.receiptTimers.set(
      item.id,
      unref(
        setTimeout(() => {
          this.receiptTimers.delete(item.id);
          void this.queue.add(() => this.refreshItem(item.id).then(() => undefined));
        }, 50),
      ),
    );
    this.scheduleStatus();
  }

  private scheduleStatus(): void {
    if (this.statusTimer || !this.running) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      void this.writeStatusNow();
    }, this.options.statusDebounceMs ?? 2000);
  }

  buildStatus() {
    return buildStatus(this.options.db, {
      appVersion: this.options.appVersion,
      timeZone: this.timeZone,
      now: this.now(),
      autoSchedule: this.autoSchedule,
      previews: this.setting(SETTING_KEYS.statusPreviews, true),
      allowOutsideMedia: this.setting(SETTING_KEYS.allowOutsideMedia, false),
      platforms: this.platforms,
    });
  }

  async writeStatusNow(): Promise<void> {
    if (!this.writeOutputs || !existsSync(this.layout.root)) return;
    try {
      await atomicWrite(this.layout.status, `${JSON.stringify(this.buildStatus(), null, 2)}\n`);
    } catch (error) {
      this.lastError = `Status file: ${(error as Error).message}`;
    }
  }

  private async pruneReceipts(): Promise<void> {
    const nowMs = this.now().getTime();
    if (nowMs - this.lastPrune < 3_600_000) return;
    this.lastPrune = nowMs;
    const cutoff = new Date(nowMs - RECEIPT_RETENTION_MS).toISOString();
    const ids = this.options.db
      .prepare('SELECT id FROM inbox_items WHERE terminal_at IS NOT NULL AND terminal_at<?')
      .pluck()
      .all(cutoff) as string[];
    for (const id of ids) await rm(join(this.layout.receipts, `${id}.json`), { force: true });
  }

  // ── owner actions ────────────────────────────────────────────────────────────────────────────────────

  /** Approve a held item: its draft targets are scheduled (re-timed if their time has passed) and jittered. */
  async approve(id: string): Promise<Receipt | null> {
    return this.queue.add(async () => {
      const item = this.store.get(id);
      if (!item?.post_id) throw new Error(`Nothing to approve for ${id}`);
      const db = this.options.db;
      const soon = new Date(this.now().getTime() + 60_000);
      const rows = db
        .prepare("SELECT id,scheduled_at_utc FROM post_targets WHERE post_id=? AND status='draft'")
        .all(item.post_id) as Array<{ id: number; scheduled_at_utc: string | null }>;
      db.transaction(() => {
        for (const row of rows) {
          const planned = row.scheduled_at_utc ? new Date(row.scheduled_at_utc) : soon;
          const at = planned < soon ? soon : planned;
          db.prepare(
            "UPDATE post_targets SET status='scheduled',scheduled_at_utc=?,jittered_at_utc=? WHERE id=?",
          ).run(at.toISOString(), jitterDate(at).toISOString(), row.id);
        }
        db.prepare("UPDATE posts SET status='scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
          item.post_id,
        );
        this.store.setState(id, 'scheduled');
      })();
      recalculatePostStatus(db, item.post_id);
      const receipt = await this.refreshItem(id);
      this.scheduleStatus();
      return receipt;
    }) as Promise<Receipt | null>;
  }

  /** Reject an item from the Inbox screen: unpublished targets are cancelled and the item ends `rejected`. */
  async reject(id: string): Promise<Receipt | null> {
    return this.queue.add(async () => {
      const item = this.store.get(id);
      if (!item) throw new Error(`Unknown inbox item ${id}`);
      const db = this.options.db;
      if (item.post_id) {
        db.prepare(
          "UPDATE post_targets SET status='cancelled' WHERE post_id=? AND status NOT IN ('published','publishing')",
        ).run(item.post_id);
      }
      this.store.setState(id, 'rejected');
      if (item.post_id) recalculatePostStatus(db, item.post_id);
      const receipt = await this.refreshItem(id);
      this.scheduleStatus();
      return receipt;
    }) as Promise<Receipt | null>;
  }

  // ── reporting ────────────────────────────────────────────────────────────────────────────────────────

  async health(): Promise<InboxHealth> {
    const exists = existsSync(this.layout.inbox);
    const db = this.options.db;
    const count = (sql: string, ...args: unknown[]) =>
      Number(
        db
          .prepare(sql)
          .pluck()
          .get(...args),
      );
    const dayStart = new Date(this.now());
    dayStart.setHours(0, 0, 0, 0);
    const pendingFiles = exists ? (await this.candidates()).length : 0;
    const state: InboxHealth['state'] = !exists ? 'danger' : this.lastError ? 'warn' : 'ok';
    return {
      folder: this.layout.root,
      exists,
      watching: Boolean(this.watcher) || this.running,
      lastScanAt: this.lastScanAt,
      lastError: this.lastError,
      state,
      pendingFiles,
      held: count("SELECT count(*) FROM inbox_items WHERE state='held'"),
      waitingMedia: count("SELECT count(*) FROM inbox_items WHERE state='waiting_media'"),
      rejectedToday: count(
        "SELECT count(*) FROM inbox_files WHERE outcome='rejected' AND processed_at>=?",
        dayStart.toISOString(),
      ),
    };
  }

  /** Items with their current receipts plus duplicate files, newest first (Inbox screen). */
  list(): InboxListItem[] {
    const db = this.options.db;
    const text = db.prepare('SELECT base_text FROM posts WHERE id=?').pluck();
    const items: InboxListItem[] = this.store.list().map((item) => ({
      key: `item:${item.id}`,
      id: item.id,
      postId: item.post_id,
      state: effectiveState(
        item.state,
        item.post_id ? targetsOf(db, item.post_id).map((target) => target.status) : [],
      ),
      source: item.source,
      sourceKind: item.source_kind,
      fileName: item.file_name,
      storedPath: item.stored_path,
      receivedAt: item.received_at,
      text: item.post_id ? ((text.get(item.post_id) as string | undefined) ?? null) : null,
      receipt: buildReceipt(db, item),
    }));
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const file of this.store.files(500).filter((row) => row.outcome === 'duplicate')) {
      const original = file.item_id ? byId.get(file.item_id) : undefined;
      if (!original) continue;
      items.push({
        ...original,
        key: `file:${file.id}`,
        state: 'duplicate',
        fileName: file.file_name,
        storedPath: file.stored_path,
        receivedAt: file.processed_at,
        receipt: { ...original.receipt, state: 'duplicate', file: file.stored_path },
      });
    }
    return items.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  /** Sources that wrote files, for Settings → Automation → Writers seen. */
  writers(): WriterRow[] {
    return (
      this.options.db
        .prepare(
          `SELECT COALESCE(f.source,i.source) AS source,count(*) AS files,max(f.processed_at) AS lastSeen
           FROM inbox_files f LEFT JOIN inbox_items i ON i.id=f.item_id
           WHERE COALESCE(f.source,i.source) IS NOT NULL GROUP BY COALESCE(f.source,i.source) ORDER BY lastSeen DESC`,
        )
        .all() as Array<{ source: string; files: number; lastSeen: string }>
    ).map((row) => ({ ...row, sourceKind: sourceKindOf(row.source) }));
  }

  isTerminal(state: InboxItemState): boolean {
    return TERMINAL_STATES.includes(state);
  }

  // ── notifications ────────────────────────────────────────────────────────────────────────────────────

  private notify(title: string, body: string): void {
    this.options.notify?.(title, body);
  }

  private noticeHeld(): void {
    if (this.heldNotice) return;
    this.heldNotice = unref(
      setTimeout(() => {
        this.heldNotice = null;
        const held = Number(
          this.options.db.prepare("SELECT count(*) FROM inbox_items WHERE state='held'").pluck().get(),
        );
        if (held)
          this.notify(
            `${held} post${held === 1 ? '' : 's'} waiting for review`,
            'Open the Inbox in Handpost to approve or reject.',
          );
      }, 1500),
    );
  }
}

export { sourceKindOf, type NormalizedPost };
