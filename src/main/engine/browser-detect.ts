/** Finds the real browser Handpost drives and its version, without launching it (H6). */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { browserCandidates, type BrowserChannel } from './browser';

export interface BrowserInfo {
  channel: BrowserChannel;
  found: boolean;
  path: string | null;
  version: string | null;
  label: string;
}

export interface DetectDeps {
  exists: (path: string) => boolean;
  readDir: (path: string) => string[];
  readText: (path: string) => string;
  run: (file: string, args: string[]) => string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}

const defaultDeps: DetectDeps = {
  exists: existsSync,
  readDir: (path) => readdirSync(path),
  readText: (path) => readFileSync(path, 'utf8'),
  run: (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 3000, windowsHide: true }),
  env: process.env,
  platform: process.platform,
};

const LABELS: Record<BrowserChannel, string> = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  chromium: 'Chromium (Playwright, development only)',
};

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let index = 0; index < Math.max(pa.length, pb.length); index++) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Reads the installed version: Windows keeps a `<version>` folder beside the exe, macOS an Info.plist. */
export function readBrowserVersion(path: string, deps: DetectDeps = defaultDeps): string | null {
  try {
    if (deps.platform === 'win32') {
      const versions = deps
        .readDir(dirname(path))
        .filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
        .sort(compareVersions);
      return versions.at(-1) ?? null;
    }
    if (deps.platform === 'darwin') {
      const plist = deps.readText(join(path, 'Contents', 'Info.plist'));
      return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null;
    }
    return /(\d+\.\d+\.\d+\.\d+)/.exec(deps.run(path, ['--version']))?.[1] ?? null;
  } catch {
    return null;
  }
}

export function detectBrowser(channel: BrowserChannel, deps: DetectDeps = defaultDeps): BrowserInfo {
  if (channel === 'chromium')
    return { channel, found: true, path: null, version: null, label: LABELS.chromium };
  const path =
    browserCandidates(channel, deps.env, deps.platform).find((candidate) => deps.exists(candidate)) ?? null;
  return {
    channel,
    found: Boolean(path),
    path,
    version: path ? readBrowserVersion(path, deps) : null,
    label: LABELS[channel],
  };
}

/** Errors Playwright throws when the requested browser channel is not installed. */
export function isBrowserMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|distribution '?\w+'? is not found|is not found at|Failed to launch.*ENOENT|spawn .* ENOENT/i.test(
    message,
  );
}
