import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
const ipcHandlers = vi.hoisted(() => new Map<string, (event: unknown, ...args: any[]) => unknown>());
vi.mock('electron', () => ({
  app: { setLoginItemSettings: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: {
    handle: (name: string, handler: (event: unknown, ...args: any[]) => unknown) =>
      ipcHandlers.set(name, handler),
  },
}));
import { registerHandlers } from '../../src/main/ipc/handlers';
describe('account connection flow', () => {
  it('polls the visible login page and persists session health', async () => {
    const db = openDatabase();
    db.prepare(
      "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('x','X','x','unknown')",
    ).run();
    let loggedIn = false;
    const page = {
      goto: vi.fn(async () => {}),
      isClosed: () => false,
      once: vi.fn(),
      locator: (selector: string) => ({
        first: () => ({
          count: async () => (selector.includes('SideNav_AccountSwitcher') && loggedIn ? 1 : 0),
        }),
      }),
    };
    const ctx = { pages: () => [page], newPage: async () => page };
    const engine = { context: vi.fn(async () => ctx), close: vi.fn(async () => {}) } as any;
    registerHandlers(db, engine, 'handpost-data');
    await ipcHandlers.get('connect')!({}, { platform: 'x' });
    expect(db.prepare("SELECT status FROM accounts WHERE platform='x'").pluck().get()).toBe('needs_login');
    loggedIn = true;
    await vi.waitFor(() => expect(engine.close).toHaveBeenCalledWith('x'), { timeout: 3_500, interval: 100 });
    expect(db.prepare("SELECT status FROM accounts WHERE platform='x'").pluck().get()).toBe('ok');
    db.close();
  });
});
