/**
 * Smoke test for a packaged build (H7): starts the unpacked app from release/ with a throwaway data folder and
 * Handpost folder, checks it creates handpost.db and the folder layout, drops the protocol examples into the
 * inbox and waits for their receipts. Nothing real is touched: no accounts are connected, the Relay import is
 * skipped (HANDPOST_DATA_DIR), and nothing can publish.
 *
 *   npm run dist:dir && npm run smoke:packaged
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function executable(): string {
  // An installed copy can be tested too: HANDPOST_EXE=C:\path\to\Handpost.exe npm run smoke:packaged
  if (process.env.HANDPOST_EXE) return process.env.HANDPOST_EXE;
  if (process.platform === 'win32') return join('release', 'win-unpacked', 'Handpost.exe');
  if (process.platform === 'darwin') {
    for (const dir of ['mac-universal', 'mac', 'mac-arm64'])
      if (existsSync(join('release', dir)))
        return join('release', dir, 'Handpost.app', 'Contents', 'MacOS', 'Handpost');
  }
  return join('release', 'linux-unpacked', 'handpost');
}

async function waitFor<T>(
  what: string,
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 60_000,
): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const exe = executable();
if (!existsSync(exe)) throw new Error(`${exe} not found — run npm run dist:dir first (or set HANDPOST_EXE)`);
const base = await mkdtemp(join(tmpdir(), 'handpost-packaged-'));
const dataDir = join(base, 'data');
const folder = join(base, 'Handpost');
// Electron treats ELECTRON_RUN_AS_NODE as set even when empty, so remove it rather than blanking it.
const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HANDPOST_DATA_DIR: dataDir,
  HANDPOST_FOLDER: folder,
  HANDPOST_QUIET: '1',
};
delete childEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, process.platform === 'linux' ? ['--no-sandbox'] : [], {
  env: childEnv,
  stdio: 'ignore',
});
let exited = false;
child.on('exit', () => (exited = true));
try {
  await waitFor('handpost.db', async () => existsSync(join(dataDir, 'handpost.db')));
  await waitFor('the Handpost folder layout', async () =>
    ['inbox', 'processed', 'rejected', 'receipts', 'README.txt', 'HANDPOST_WRITER.md'].every((name) =>
      existsSync(join(folder, name)),
    ),
  );
  const status = await waitFor('handpost.status.json', async () =>
    JSON.parse(await readFile(join(folder, 'handpost.status.json'), 'utf8')),
  );
  console.log(
    `Launched ${exe}: handpost.db created, folder laid out, status file says app_version ${status.app_version}`,
  );

  const examples = join('examples', 'inbox');
  const names = (await readdir(examples)).sort((a) => (a.startsWith('cancel') ? 1 : -1));
  for (const name of names.filter((n) => !n.startsWith('cancel')))
    await copyFile(join(examples, name), join(folder, 'inbox', name));
  const ids = ['weekly-tips-20261120-folder-scheduling', 'release-notes-0-4-x', 'release-notes-0-4-linkedin'];
  await waitFor('receipts for the examples', async () =>
    ids.every((id) => existsSync(join(folder, 'receipts', `${id}.json`))),
  );
  for (const name of names.filter((n) => n.startsWith('cancel')))
    await copyFile(join(examples, name), join(folder, 'inbox', name));
  const cancelled = await waitFor('the cancel to apply', async () => {
    const receipt = JSON.parse(await readFile(join(folder, 'receipts', `${ids[0]}.json`), 'utf8'));
    return receipt.state === 'cancelled' ? receipt : null;
  });
  const states: Record<string, string> = { [ids[0]!]: cancelled.state };
  for (const id of ids.slice(1))
    states[id] = JSON.parse(await readFile(join(folder, 'receipts', `${id}.json`), 'utf8')).state;
  const left = (await readdir(join(folder, 'inbox'))).filter((name) => !name.startsWith('.'));
  if (left.length) throw new Error(`Files left in inbox: ${left.join(', ')}`);
  if (states[ids[1]!] !== 'held' || states[ids[2]!] !== 'held')
    throw new Error(`Expected held items (Auto-schedule starts off): ${JSON.stringify(states)}`);
  console.log(`Inbox smoke on the packaged app passed: ${JSON.stringify(states)}`);
} finally {
  if (!exited) {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        child.kill();
      }
    } else child.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await rm(base, { recursive: true, force: true }).catch(() => undefined);
}
