import { app, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { openDatabase, type HandpostDatabase } from './db/database';
import { BrowserEngine, resolveBrowserChannel } from './engine/browser';
import { migrateLegacyData } from './migrate-legacy';
import { registerHandlers } from './ipc/handlers';
import { Scheduler } from './scheduler/scheduler';
import { CircuitBreaker } from './scheduler/circuit-breaker';
import { PLATFORM_IDS } from '../shared/types';
import { createLocalLogger } from './logging';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: Scheduler | null = null;
let engine: BrowserEngine | null = null;
let database: HandpostDatabase | null = null;
let localLog: ReturnType<typeof createLocalLogger> | null = null;
let trayTimer: ReturnType<typeof setInterval> | null = null;
let shutdownReady = false;
/** Set when the user really quits (tray menu or OS); otherwise closing the window only hides it. */
let isQuitting = false;
if (process.platform === 'win32') app.setAppUserModelId('com.tanzir.handpost');
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
  tray?.setImage(trayImage(danger));
  tray?.setToolTip(danger ? 'Handpost — automation frozen' : 'Handpost scheduler');
}
async function boot() {
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  localLog = createLocalLogger(dataDir);
  localLog.logger.info('Handpost starting');
  const legacy = migrateLegacyData(app.getPath('appData'), dataDir);
  if (legacy.migrated)
    localLog.logger.info(
      { from: legacy.from, copied: legacy.copied, failed: legacy.failed },
      'Imported data from Relay',
    );
  const db = openDatabase(join(dataDir, 'handpost.db'));
  database = db;
  engine = new BrowserEngine(join(dataDir, 'profiles'), resolveBrowserChannel(process.env.HANDPOST_BROWSER));
  localLog.logger.info({ browser: engine.channel }, 'Browser channel selected');
  for (const platform of PLATFORM_IDS)
    db.prepare('INSERT OR IGNORE INTO accounts(platform,display_name,profile_dir) VALUES (?,?,?)').run(
      platform,
      platform === 'mock' ? 'MockSocial' : platform[0]!.toUpperCase() + platform.slice(1),
      join(dataDir, 'profiles', platform),
    );
  registerHandlers(db, engine, dataDir);
  app.setLoginItemSettings({
    openAtLogin: db.prepare("SELECT value FROM settings WHERE key='launchAtLogin'").pluck().get() === 'true',
  });
  scheduler = new Scheduler(
    db,
    engine,
    (title, body) => {
      localLog?.logger.warn({ title }, 'Scheduler notification');
      if (db.prepare("SELECT value FROM settings WHERE key='notifications'").pluck().get() !== 'false')
        new Notification({ title, body }).show();
      updateTray(db);
    },
    undefined,
    join(dataDir, 'artifacts'),
  );
  scheduler.start();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#090b10',
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
  if (legacy.migrated)
    new Notification({
      title: 'Handpost imported your Relay data',
      body: 'Drafts, queue, history and browser sessions were copied over. The old Relay folder was left untouched.',
    }).show();
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
  if (shutdownReady) return;
  event.preventDefault();
  void (async () => {
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
