import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  powerMonitor,
  Tray,
} from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { openDatabase, type HandpostDatabase } from './db/database';
import { BrowserEngine, resolveBrowserChannel } from './engine/browser';
import { detectBrowser } from './engine/browser-detect';
import { LEGACY_IMPORT_NOTICE, migrateLegacyData } from './migrate-legacy';
import { registerHandlers } from './ipc/handlers';
import { Scheduler } from './scheduler/scheduler';
import { SelectorService } from './selectors/service';
import { CircuitBreaker } from './scheduler/circuit-breaker';
import { PLATFORM_IDS } from '../shared/types';
import { createLocalLogger } from './logging';
import { InboxService, SETTING_KEYS } from './inbox/service';
import { defaultHandpostFolder, WRITER_FILE } from './inbox/paths';
import { readIntegration } from './inbox/integrations';
import { GitSource } from './inbox/git-source';
import { INBOX_PLATFORMS } from '../shared/inbox-schema';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: Scheduler | null = null;
let engine: BrowserEngine | null = null;
let database: HandpostDatabase | null = null;
let localLog: ReturnType<typeof createLocalLogger> | null = null;
let trayTimer: ReturnType<typeof setInterval> | null = null;
let shutdownReady = false;
let inbox: InboxService | null = null;
let gitTimer: ReturnType<typeof setInterval> | null = null;
/** Set when the user really quits (tray menu or OS); otherwise closing the window only hides it. */
let isQuitting = false;
if (process.platform === 'win32') app.setAppUserModelId('com.tanzir.handpost');
/**
 * Smoke/CI overrides: HANDPOST_DATA_DIR replaces the user-data folder (and skips the one-time legacy-data import, so a
 * smoke run never copies real data) and HANDPOST_FOLDER replaces the Handpost folder.
 */
const dataDirOverride = process.env.HANDPOST_DATA_DIR;
/**
 * HANDPOST_QUIET=1 (smoke tests): no desktop notifications — on Windows the first toast registers a Start-menu
 * shortcut — and the login-item setting is left alone.
 */
const quiet = process.env.HANDPOST_QUIET === '1';
function desktopNotify(title: string, body: string): void {
  if (!quiet) new Notification({ title, body }).show();
}
if (dataDirOverride) app.setPath('userData', dataDirOverride);
function resolveAsset(name: string): string {
  const candidates = [join(__dirname, 'assets', name), join(process.cwd(), 'src', 'main', 'assets', name)];
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!;
}
function trayImage(danger: boolean) {
  return nativeImage.createFromPath(resolveAsset(danger ? 'tray-alert.png' : 'tray.png'));
}
function updateTray(db: HandpostDatabase) {
  const breaker = new CircuitBreaker(db);
  for (const platform of db
    .prepare("SELECT platform FROM accounts WHERE status='frozen'")
    .pluck()
    .all() as string[])
    breaker.isOpen(platform);
  const danger = Boolean(db.prepare("SELECT 1 FROM accounts WHERE status='frozen' LIMIT 1").get());
  const paused =
    db.prepare("SELECT value FROM settings WHERE key='publishing.paused'").pluck().get() === 'true';
  tray?.setImage(trayImage(danger));
  tray?.setToolTip(
    danger ? 'Handpost — automation frozen' : paused ? 'Handpost — publishing paused' : 'Handpost scheduler',
  );
}
async function boot() {
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  localLog = createLocalLogger(dataDir);
  localLog.logger.info('Handpost starting');
  const legacy = dataDirOverride
    ? { migrated: false as const, from: null, copied: [], failed: [] }
    : migrateLegacyData(app.getPath('appData'), dataDir);
  if (legacy.migrated)
    localLog.logger.info(
      { from: legacy.from, copied: legacy.copied, failed: legacy.failed },
      LEGACY_IMPORT_NOTICE.log,
    );
  const db = openDatabase(join(dataDir, 'handpost.db'));
  database = db;
  engine = new BrowserEngine(join(dataDir, 'profiles'), resolveBrowserChannel(process.env.HANDPOST_BROWSER));
  // Detect the browser once now and again at most once a minute (installing Chrome while Handpost runs works).
  let browserCache = { info: detectBrowser(engine.channel), at: Date.now() };
  const browser = () => {
    if (Date.now() - browserCache.at > 60_000)
      browserCache = { info: detectBrowser(engine!.channel), at: Date.now() };
    return browserCache.info;
  };
  localLog.logger.info(
    { browser: engine.channel, found: browserCache.info.found, version: browserCache.info.version },
    'Browser channel selected',
  );
  for (const platform of PLATFORM_IDS)
    db.prepare('INSERT OR IGNORE INTO accounts(platform,display_name,profile_dir) VALUES (?,?,?)').run(
      platform,
      platform === 'mock' ? 'MockSocial' : platform[0]!.toUpperCase() + platform.slice(1),
      join(dataDir, 'profiles', platform),
    );
  const notify = (title: string, body: string) => {
    if (db.prepare("SELECT value FROM settings WHERE key='notifications'").pluck().get() !== 'false')
      desktopNotify(title, body);
  };
  const writerGuide = readIntegration(WRITER_FILE);
  const settingValue = (key: string) =>
    db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key) as string | undefined;
  // Optional remote Git source (off by default; the only network access besides the platforms).
  const gitSource = new GitSource(() => inbox!.folder);
  const gitConfig = () => ({
    enabled: settingValue('git.enabled') === 'true',
    url: settingValue('git.url') ?? '',
    pushReceipts: settingValue('git.pushReceipts') === 'true',
  });
  gitSource.configure(gitConfig());
  inbox = new InboxService({
    db,
    root:
      (db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(SETTING_KEYS.path) as
        string | undefined) ??
      process.env.HANDPOST_FOLDER ??
      defaultHandpostFolder(app.getPath('home')),
    mediaStore: join(dataDir, 'media'),
    appVersion: app.getVersion(),
    // MockSocial is only accepted from the inbox in development smoke runs.
    platforms: process.env.HANDPOST_INBOX_MOCK === '1' ? [...INBOX_PLATFORMS, 'mock'] : INBOX_PLATFORMS,
    notify: (title, body) => {
      localLog?.logger.info({ title }, 'Inbox notification');
      notify(title, body);
    },
    layoutFiles: writerGuide ? { [WRITER_FILE]: writerGuide } : {},
    extraRoots: () => gitSource.roots(),
  });
  const gitCycle = async () => {
    if (!gitSource.health().enabled || !inbox) return gitSource.health();
    await gitSource.sync();
    await inbox.rescan();
    await inbox.idle();
    if (gitSource.name) await gitSource.pushReceipts(inbox.idsForRoot(`git:${gitSource.name}`));
    return gitSource.health();
  };
  gitTimer = setInterval(() => void gitCycle(), 5 * 60_000);
  if (!quiet)
    app.setLoginItemSettings({
      openAtLogin:
        db.prepare("SELECT value FROM settings WHERE key='launchAtLogin'").pluck().get() === 'true',
    });
  // Accounts → Selectors: the owner's applied fixes, proposals in <Handpost folder>/selectors/, repair reports.
  const checkChannel = engine.channel;
  const selectorService = new SelectorService({
    db,
    folder: () => inbox!.folder,
    appVersion: app.getVersion(),
    guide: readIntegration('HANDPOST_SELECTORS.md') || undefined,
    launch: async () =>
      (await import('playwright')).chromium.launch({
        headless: true,
        ...(checkChannel === 'chromium' ? {} : { channel: checkChannel }),
      }),
  });
  selectorService.install();
  scheduler = new Scheduler(
    db,
    engine,
    (title, body) => {
      localLog?.logger.warn({ title }, 'Scheduler notification');
      if (db.prepare("SELECT value FROM settings WHERE key='notifications'").pluck().get() !== 'false')
        desktopNotify(title, body);
      updateTray(db);
    },
    undefined,
    join(dataDir, 'artifacts'),
    { browserReady: () => browser().found, repairs: selectorService },
  );
  const activeScheduler = scheduler;
  registerHandlers(
    db,
    engine,
    dataDir,
    inbox,
    (key, value) => {
      if (key.startsWith('git.')) {
        gitSource.configure(gitConfig());
        void gitCycle();
      }
      if (key === 'publishing.paused') {
        updateTray(db);
        // On resume, posts more than two hours late wait for a look (the same rule as after the app was closed).
        if (value === 'false') void activeScheduler.handleOverdue();
      }
    },
    {
      git: { health: () => gitSource.health(), syncNow: gitCycle },
      browserInfo: browser,
      rehearse: (platform, input, trial) => activeScheduler.rehearse(platform, input, trial),
      reverify: (targetId) => activeScheduler.reverify(targetId),
      selectors: selectorService,
    },
  );
  scheduler.start();
  await inbox
    .start()
    .catch((error: unknown) =>
      localLog?.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Inbox failed to start',
      ),
    );
  powerMonitor.on('resume', () => void inbox?.rescan());
  void gitCycle();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    // Canvas colour of the active theme (tokens.css) so the window never flashes the wrong colour.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15130f' : '#f4efe6',
    title: 'Handpost',
    icon: resolveAsset('icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.HANDPOST_DEV_SERVER_URL;
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  tray = new Tray(trayImage(false));
  updateTray(db);
  trayTimer = setInterval(() => updateTray(db), 30_000);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Handpost', click: () => mainWindow?.show() },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  if (legacy.migrated) desktopNotify(LEGACY_IMPORT_NOTICE.title, LEGACY_IMPORT_NOTICE.body);
  localLog.logger.info('Handpost ready');
}
app
  .whenReady()
  .then(boot)
  .catch((error) => {
    localLog?.logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Handpost failed to start',
    );
    console.error('Handpost failed to start', error);
    app.quit();
  });
app.on('activate', () => mainWindow?.show());
app.on('before-quit', (event) => {
  isQuitting = true;
  scheduler?.stop();
  if (trayTimer) clearInterval(trayTimer);
  if (gitTimer) clearInterval(gitTimer);
  if (shutdownReady) return;
  event.preventDefault();
  void (async () => {
    // The inbox stops first so no new post is committed while the scheduler drains.
    await inbox?.stop().catch(() => undefined);
    await scheduler?.idle().catch(() => undefined);
    await engine?.close().catch(() => undefined);
    database?.close();
    database = null;
    localLog?.logger.info('Handpost stopped');
    await localLog?.close();
    localLog = null;
    shutdownReady = true;
    app.quit();
  })();
});
app.on('window-all-closed', () => {});
