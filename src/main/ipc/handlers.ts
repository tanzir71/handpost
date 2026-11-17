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
import { nextFreeSlot } from '../scheduler/slots';
import { connectAccount } from '../accounts/connect';
import { recalculatePostStatus } from '../scheduler/status';
import { CircuitBreaker } from '../scheduler/circuit-breaker';
import type { SettingRow, TargetListRow } from '../../shared/rows';

export function registerHandlers(db: HandpostDatabase, engine: BrowserEngine, dataDir: string): void {
  // Every payload is `unknown` until a zod schema parses it.
  const handle = (name: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(name, (_event, ...args) => fn(...args));
  handle('snapshot', () => ({
    accounts: db.prepare('SELECT * FROM accounts ORDER BY platform').all(),
    posts: db.prepare('SELECT * FROM posts ORDER BY updated_at DESC').all(),
    targets: db
      .prepare(
        'SELECT t.*,a.platform,p.base_text FROM post_targets t JOIN accounts a ON a.id=t.account_id JOIN posts p ON p.id=t.post_id ORDER BY COALESCE(t.scheduled_at_utc,t.id)',
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
    const tx = db.transaction(() => {
      let id = input.id;
      if (id)
        db.prepare('UPDATE posts SET base_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
          input.text,
          input.status,
          id,
        );
      else
        id = Number(
          db.prepare('INSERT INTO posts(base_text,status) VALUES (?,?)').run(input.text, input.status)
            .lastInsertRowid,
        );
      db.prepare("DELETE FROM post_targets WHERE post_id=? AND status IN ('draft','scheduled')").run(id);
      for (const target of input.targets) {
        if (input.status === 'scheduled' && !target.scheduledAt)
          throw new Error('Scheduled targets require a date');
        const scheduled = target.scheduledAt ? new Date(target.scheduledAt) : null;
        db.prepare(
          'INSERT INTO post_targets(post_id,account_id,override_text,first_comment,scheduled_at_utc,jittered_at_utc,status,options_json) VALUES (?,?,?,?,?,?,?,?)',
        ).run(
          id,
          target.accountId,
          target.overrideText ?? null,
          target.firstComment ?? null,
          scheduled?.toISOString() ?? null,
          scheduled ? jitterDate(scheduled).toISOString() : null,
          input.status,
          JSON.stringify(target.options ?? {}),
        );
      }
      return id;
    });
    return tx();
  });
  handle('queue-post', (raw) => {
    const input = queuePostSchema.parse(raw);
    return db.transaction(() => {
      let id = input.id;
      if (id)
        db.prepare(
          "UPDATE posts SET base_text=?,status='scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(input.text, id);
      else
        id = Number(
          db.prepare("INSERT INTO posts(base_text,status) VALUES (?,'scheduled')").run(input.text)
            .lastInsertRowid,
        );
      db.prepare("DELETE FROM post_targets WHERE post_id=? AND status IN ('draft','scheduled')").run(id);
      for (const target of input.targets) {
        const slots = db
          .prepare('SELECT weekday,time_local AS timeLocal FROM queue_slots WHERE account_id=?')
          .all(target.accountId) as Array<{ weekday: number; timeLocal: string }>;
        const occupied = db
          .prepare(
            "SELECT scheduled_at_utc FROM post_targets WHERE account_id=? AND status IN ('scheduled','publishing')",
          )
          .pluck()
          .all(target.accountId) as string[];
        const scheduled = nextFreeSlot(slots, occupied, new Date());
        if (!scheduled) throw new Error('No available queue slot; configure slots in Accounts.');
        db.prepare(
          'INSERT INTO post_targets(post_id,account_id,override_text,first_comment,scheduled_at_utc,jittered_at_utc,status,options_json) VALUES (?,?,?,?,?,?,?,?)',
        ).run(
          id,
          target.accountId,
          target.overrideText ?? null,
          target.firstComment ?? null,
          scheduled.toISOString(),
          jitterDate(scheduled).toISOString(),
          'scheduled',
          JSON.stringify(target.options ?? {}),
        );
      }
      return id;
    })();
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
    db.prepare(
      'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(v.key, v.value);
    if (v.key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: v.value === 'true' });
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
