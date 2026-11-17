import { app, clipboard, dialog, ipcMain, shell } from 'electron';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import {
  accountConnectSchema,
  accountSettingsSchema,
  artifactPathSchema,
  csvImportSchema,
  externalUrlSchema,
  mediaAltSchema,
  mediaDataSchema,
  positiveIdSchema,
  postSaveSchema,
  queuePostSchema,
  rescheduleSchema,
  retrySchema,
  settingSchema,
  templateSchema,
} from '../../shared/ipc';
import type { HandpostDatabase } from '../db/database';
import type { BrowserEngine } from '../engine/browser';
import { jitterDate } from '../engine/humanizer';
import { adapterConfigs } from '../adapters/configs';
import { inspectMedia } from '../media/inspect';
import { exportArchive, importArchive } from '../data/archive';
import { applyCsvImport, planCsvImport } from '../data/csv';
import { queuePost, savePost } from '../posts/create';
import { connectAccount } from '../accounts/connect';
import { recalculatePostStatus } from '../scheduler/status';
import { CircuitBreaker } from '../scheduler/circuit-breaker';
import type { SettingRow, TargetListRow } from '../../shared/rows';
import type { InboxService } from '../inbox/service';
import { identityFromUrl } from '../adapters/identity';
import { rehearsalPost } from '../accounts/rehearsal';
import type { BrowserInfo } from '../engine/browser-detect';
import { validGitUrl, type GitHealth } from '../inbox/git-source';
import type { RehearsalInput, RehearsalResult } from '../scheduler/scheduler';
import type { PlatformId } from '../../shared/types';
import { existsSync } from 'node:fs';

export interface LiveDeps {
  browserInfo?: () => BrowserInfo;
  git?: { health(): GitHealth; syncNow(): Promise<GitHealth> };
  rehearse?: (platform: PlatformId, input: RehearsalInput) => Promise<RehearsalResult>;
}
import { inboxIdSchema, inboxOpenSchema, profileUrlSchema, targetIdSchema } from '../../shared/ipc';
import { SETTING_KEYS } from '../inbox/service';
import { breakerRows, pacingToday } from '../scheduler/pacing';
import { automationInfo, readIntegration } from '../inbox/integrations';

export function registerHandlers(
  db: HandpostDatabase,
  engine: BrowserEngine,
  dataDir: string,
  inbox?: InboxService,
  onSettingChanged?: (key: string, value: string) => void,
  live: LiveDeps = {},
): void {
  // Every payload is `unknown` until a zod schema parses it.
  const handle = (name: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(name, (_event, ...args) => fn(...args));
  handle('snapshot', () => ({
    accounts: db.prepare('SELECT * FROM accounts ORDER BY platform').all(),
    posts: db.prepare("SELECT * FROM posts WHERE status<>'rehearsal' ORDER BY updated_at DESC").all(),
    targets: db
      .prepare(
        "SELECT t.*,a.platform,p.base_text FROM post_targets t JOIN accounts a ON a.id=t.account_id JOIN posts p ON p.id=t.post_id WHERE t.status<>'rehearsal' ORDER BY COALESCE(t.scheduled_at_utc,t.id)",
      )
      .all(),
    media: db.prepare('SELECT * FROM media ORDER BY order_idx,id').all(),
    attempts: db
      .prepare(
        'SELECT a.*,t.post_id,t.published_url,ac.platform FROM publish_attempts a JOIN post_targets t ON t.id=a.target_id JOIN accounts ac ON ac.id=t.account_id ORDER BY a.started_at DESC',
      )
      .all(),
    slots: db.prepare('SELECT * FROM queue_slots').all(),
    templates: db.prepare('SELECT * FROM templates ORDER BY name').all(),
    settings: [
      ...(db.prepare('SELECT * FROM settings').all() as SettingRow[]),
      { key: 'dataFolder', value: dataDir },
    ],
  }));
  handle('save-post', (raw) => {
    const input = postSaveSchema.parse(raw);
    return savePost(db, {
      id: input.id,
      text: input.text,
      status: input.status,
      targets: input.targets.map((target) => ({ ...target, scheduledAt: target.scheduledAt ?? null })),
    });
  });
  handle('queue-post', (raw) => {
    const input = queuePostSchema.parse(raw);
    return queuePost(db, { id: input.id, text: input.text, targets: input.targets });
  });
  handle('reschedule', (raw) => {
    const v = rescheduleSchema.parse(raw);
    const date = new Date(v.scheduledAt);
    const postId = db.prepare('SELECT post_id FROM post_targets WHERE id=?').pluck().get(v.targetId);
    db.prepare(
      "UPDATE post_targets SET scheduled_at_utc=?,jittered_at_utc=?,status=CASE WHEN status IN ('scheduled','needs_attention') THEN 'scheduled' ELSE status END WHERE id=?",
    ).run(date.toISOString(), jitterDate(date).toISOString(), v.targetId);
    if (typeof postId === 'number') recalculatePostStatus(db, postId);
  });
  handle('retry', (raw) => {
    const v = retrySchema.parse(raw);
    const postId = db.prepare('SELECT post_id FROM post_targets WHERE id=?').pluck().get(v.targetId);
    db.prepare(
      "UPDATE post_targets SET status='scheduled',jittered_at_utc=CURRENT_TIMESTAMP,error_code=NULL,error_detail=NULL WHERE id=?",
    ).run(v.targetId);
    if (typeof postId === 'number') recalculatePostStatus(db, postId);
  });
  handle('connect', async (raw) => {
    const { platform } = accountConnectSchema.parse(raw);
    await connectAccount(db, engine, platform);
  });
  handle('reenable', (raw) => {
    const { platform } = accountConnectSchema.parse({ platform: raw });
    const posts = db
      .prepare(
        "SELECT DISTINCT post_id FROM post_targets WHERE account_id=(SELECT id FROM accounts WHERE platform=?) AND status='manual'",
      )
      .pluck()
      .all(platform) as number[];
    new CircuitBreaker(db).reenable(platform);
    db.prepare(
      "UPDATE post_targets SET status='needs_attention',error_code='reenabled_review' WHERE account_id=(SELECT id FROM accounts WHERE platform=?) AND status='manual'",
    ).run(platform);
    for (const postId of posts) recalculatePostStatus(db, postId);
  });
  handle('attach-media', async (rawPostId: unknown) => {
    const postId = positiveIdSchema.parse(rawPostId);
    if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(postId)) throw new Error('Post not found');
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'webm'] }],
    });
    if (result.canceled) return [];
    const root = join(dataDir, 'media', String(postId));
    await mkdir(root, { recursive: true });
    const start = Number(
      db.prepare('SELECT COALESCE(max(order_idx)+1,0) FROM media WHERE post_id=?').pluck().get(postId),
    );
    const rows = [];
    for (const [index, path] of result.filePaths.entries()) {
      const out = join(root, `${Date.now()}-${basename(path)}`);
      await copyFile(path, out);
      rows.push(await saveMedia(db, postId, out, start + index));
    }
    return rows;
  });
  handle('add-media', async (raw) => {
    const input = mediaDataSchema.parse(raw);
    if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(input.postId)) throw new Error('Post not found');
    const root = join(dataDir, 'media', String(input.postId));
    await mkdir(root, { recursive: true });
    const start = Number(
      db.prepare('SELECT COALESCE(max(order_idx)+1,0) FROM media WHERE post_id=?').pluck().get(input.postId),
    );
    const rows = [];
    for (const [index, file] of input.files.entries()) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const out = join(root, `${Date.now()}-${safe}`);
      await writeFile(out, file.bytes);
      rows.push(await saveMedia(db, input.postId, out, start + index));
    }
    return rows;
  });
  handle('update-media-alt', (raw) => {
    const input = mediaAltSchema.parse(raw);
    db.prepare('UPDATE media SET alt_text=? WHERE id=?').run(input.altText, input.mediaId);
  });
  handle('save-template', (raw) => {
    const v = templateSchema.parse(raw);
    return Number(
      db
        .prepare('INSERT INTO templates(name,body,variables_json) VALUES (?,?,?)')
        .run(v.name, v.body, JSON.stringify(v.variables)).lastInsertRowid,
    );
  });
  handle('save-setting', (raw) => {
    const v = settingSchema.parse(raw);
    if (v.key === 'git.url' && v.value && !validGitUrl(v.value))
      throw new Error('Use an https://, ssh://, git@host:path or file:// Git URL');
    db.prepare(
      'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(v.key, v.value);
    if (v.key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: v.value === 'true' });
    if (v.key.startsWith('inbox.')) void inbox?.writeStatusNow();
    onSettingChanged?.(v.key, v.value);
  });
  handle('save-account-settings', (raw) => {
    const v = accountSettingsSchema.parse(raw);
    const platform = db.prepare('SELECT platform FROM accounts WHERE id=?').pluck().get(v.accountId);
    if (platform !== v.platform) throw new Error('Account and platform do not match');
    db.transaction(() => {
      db.prepare('DELETE FROM queue_slots WHERE account_id=?').run(v.accountId);
      for (const slot of v.slots)
        db.prepare('INSERT INTO queue_slots(account_id,weekday,time_local) VALUES (?,?,?)').run(
          v.accountId,
          slot.weekday,
          slot.timeLocal,
        );
      for (const [key, value] of [
        [`dailyCap:${v.platform}`, String(v.dailyCap)],
        [`headless:${v.platform}`, String(v.headless)],
      ])
        db.prepare(
          'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ).run(key, value);
    })();
  });
  handle('csv-import', (raw) => {
    const v = csvImportSchema.parse(raw);
    const rows = planCsvImport(db, v.csv);
    if (!v.dryRun) applyCsvImport(db, rows);
    return rows;
  });
  handle('export-data', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'handpost-export.zip',
      filters: [{ name: 'Handpost archive', extensions: ['zip'] }],
    });
    if (!result.canceled && result.filePath) exportArchive(db, result.filePath);
    return result.filePath ?? '';
  });
  handle('import-data', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Handpost archive', extensions: ['zip'] }],
    });
    if (!result.canceled) importArchive(db, result.filePaths[0]!, dataDir);
  });
  handle('open-manual', async (rawTargetId: unknown) => {
    const targetId = positiveIdSchema.parse(rawTargetId);
    const row = db
      .prepare(
        'SELECT t.*,p.base_text,a.platform FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN accounts a ON a.id=t.account_id WHERE t.id=?',
      )
      .get(targetId) as TargetListRow | undefined;
    if (!row) throw new Error('Target not found');
    clipboard.writeText(row.override_text ?? row.base_text);
    const config = adapterConfigs.find((c) => c.id === row.platform);
    if (config) {
      const ctx = await engine.context(row.platform);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(config.compose, { waitUntil: 'domcontentloaded' });
      await page.bringToFront();
    }
    db.prepare("UPDATE post_targets SET status='manual' WHERE id=?").run(targetId);
    recalculatePostStatus(db, row.post_id);
  });
  // ── Inbox & automation ──────────────────────────────────────────────────────────────────────────────
  const needInbox = () => {
    if (!inbox) throw new Error('The inbox is not running');
    return inbox;
  };
  handle('inbox-health', async () =>
    inbox ? { ...(await inbox.health()), git: live.git?.health() ?? null } : null,
  );
  handle('git-health', () => live.git?.health() ?? null);
  handle('git-sync-now', async () => (live.git ? live.git.syncNow() : null));
  handle('inbox-list', () => inbox?.list() ?? []);
  handle('inbox-approve', (raw) => needInbox().approve(inboxIdSchema.parse(raw)));
  handle('inbox-reject', (raw) => needInbox().reject(inboxIdSchema.parse(raw)));
  handle('inbox-writers', () => inbox?.writers() ?? []);
  handle('inbox-open', async (raw) => {
    const request = inboxOpenSchema.parse(raw);
    const root = needInbox().folder;
    const path =
      request.target === 'receipt'
        ? join(root, 'receipts', `${request.id}.json`)
        : request.target === 'folder'
          ? root
          : join(root, request.target);
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  });
  handle('inbox-choose-folder', async () => {
    const service = needInbox();
    const result = await dialog.showOpenDialog({
      title: 'Choose the Handpost folder',
      defaultPath: service.folder,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return service.folder;
    const folder = result.filePaths[0];
    db.prepare(
      'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(SETTING_KEYS.path, folder);
    await service.setFolder(folder);
    return folder;
  });
  handle('automation-info', () => automationInfo(needInbox().folder));
  handle('copy-agents', async () => {
    const target = join(needInbox().folder, 'AGENTS.md');
    await writeFile(target, readIntegration('AGENTS.md'), 'utf8');
    return target;
  });
  handle('pacing-today', () => pacingToday(db));
  handle('breakers', () => breakerRows(db));
  handle('cancel-target', (raw) => {
    const { targetId } = targetIdSchema.parse(raw);
    const postId = db.prepare('SELECT post_id FROM post_targets WHERE id=?').pluck().get(targetId);
    const changed = db
      .prepare(
        "UPDATE post_targets SET status='cancelled' WHERE id=? AND status NOT IN ('publishing','published')",
      )
      .run(targetId).changes;
    if (!changed) throw new Error('That post is already publishing or published');
    if (typeof postId === 'number') recalculatePostStatus(db, postId);
  });
  handle('publish-now', (raw) => {
    const { targetId } = targetIdSchema.parse(raw);
    const postId = db.prepare('SELECT post_id FROM post_targets WHERE id=?').pluck().get(targetId);
    // Due now: the next scheduler tick (≤ 30 s) picks it up, still subject to cooldowns and caps.
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE post_targets SET scheduled_at_utc=?,jittered_at_utc=?,status='scheduled' WHERE id=? AND status IN ('scheduled','needs_attention')",
    ).run(now, now, targetId);
    if (typeof postId === 'number') recalculatePostStatus(db, postId);
  });
  // ── Live readiness (H6) ────────────────────────────────────────────────────────────────────────────────
  handle('browser-info', () => ({ ...(live.browserInfo?.() ?? null), profiles: join(dataDir, 'profiles') }));
  handle('set-profile-url', (raw) => {
    const { platform, url } = profileUrlSchema.parse(raw);
    if (!url) {
      db.prepare('UPDATE accounts SET profile_url=NULL WHERE platform=?').run(platform);
      return null;
    }
    const identity = identityFromUrl(platform, url);
    if (!identity) throw new Error('That does not look like a link to your own profile on this platform');
    db.prepare('UPDATE accounts SET handle=?,profile_url=? WHERE platform=?').run(
      identity.handle,
      identity.profileUrl,
      platform,
    );
    return identity;
  });
  handle('rehearse', async (raw) => {
    const { platform } = accountConnectSchema.parse(raw);
    if (!live.rehearse) throw new Error('Rehearsal is not available');
    const input = await rehearsalPost(db, platform, dataDir, async () => {
      const result = await dialog.showOpenDialog({
        title: `Choose a short video to rehearse ${platform} with (it will not be posted)`,
        properties: ['openFile'],
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm'] }],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    if (!input) return null;
    const result = await live.rehearse(platform, input);
    const screenshot =
      result.screenshotPath && existsSync(result.screenshotPath)
        ? `data:image/png;base64,${(await readFile(result.screenshotPath)).toString('base64')}`
        : null;
    return { ...result, screenshot };
  });
  handle('app-info', () => ({
    version: app.getVersion(),
    dataDir,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    platform: process.platform,
  }));
  handle('open-external', async (rawUrl: unknown) => {
    await shell.openExternal(externalUrlSchema.parse(rawUrl));
  });
  handle('read-artifact', async (rawPath: unknown) => {
    const root = resolve(dataDir, 'artifacts');
    const path = resolve(artifactPathSchema.parse(rawPath));
    if (path !== root && !path.startsWith(`${root}${sep}`))
      throw new Error('Artifact path is outside Handpost data');
    const bytes = await readFile(path);
    const mime =
      path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  });
}
async function saveMedia(db: HandpostDatabase, postId: number, path: string, index: number) {
  const info = await inspectMedia(path);
  const id = Number(
    db
      .prepare(
        'INSERT INTO media(post_id,path,kind,width,height,duration_s,size_bytes,order_idx) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        postId,
        path,
        info.kind,
        info.width ?? null,
        info.height ?? null,
        info.durationS ?? null,
        info.sizeBytes,
        index,
      ).lastInsertRowid,
  );
  return {
    id,
    post_id: postId,
    path,
    kind: info.kind,
    width: info.width,
    height: info.height,
    duration_s: info.durationS,
    size_bytes: info.sizeBytes,
    order_idx: index,
  };
}
