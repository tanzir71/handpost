/**
 * Optional remote source (INBOX_PROTOCOL §12, H9): one Git repository whose `inbox/` is read as an extra inbox root.
 * Uses the system `git` through execFile (never a shell), the owner's existing credentials, and no prompts. Files in
 * the clone are never moved; processed state lives in the database (id + hash). Pushing receipts back is opt-in.
 * This is the only network access Handpost makes besides the platforms, and it is off by default.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES_DIR } from './paths';
import type { ExtraRoot } from './service';

export interface GitSourceConfig {
  enabled: boolean;
  url: string;
  pushReceipts: boolean;
}

export interface GitHealth {
  enabled: boolean;
  url: string;
  name: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  state: 'off' | 'ok' | 'warn' | 'danger';
}

/** https://, ssh://, git@host:path and file:// (local mirrors and tests). Never a value that git could read as an option. */
export function validGitUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.startsWith('-') || /\s/.test(value)) return false;
  return /^(https:\/\/|ssh:\/\/|file:\/\/)[^\s]+$/.test(value) || /^[\w.-]+@[\w.-]+:[\w./~-]+$/.test(value);
}

/** A folder name for the clone, from the repository name: `git@github.com:me/posts.git` → `posts`. */
export function sourceName(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? 'remote';
  const name = last
    .replace(/\.git$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name.slice(0, 40) || 'remote';
}

export type GitRunner = (args: string[], cwd?: string) => Promise<string>;

export function systemGit(timeoutMs = 60_000, git = 'git'): GitRunner {
  return (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile(
        git,
        args,
        {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          // Never wait for a username/password prompt: credentials must already be set up for this user.
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        },
        (error, stdout, stderr) => {
          if (error) reject(new Error((stderr || error.message).trim().split('\n').slice(-2).join(' ')));
          else resolve(stdout);
        },
      );
    });
}

export class GitSource {
  private config: GitSourceConfig = { enabled: false, url: '', pushReceipts: false };
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private syncing: Promise<boolean> | null = null;

  constructor(
    private readonly handpostRoot: () => string,
    private readonly git: GitRunner = systemGit(),
  ) {}

  configure(config: GitSourceConfig): void {
    const changed = config.url !== this.config.url || config.enabled !== this.config.enabled;
    this.config = { ...config, url: config.url.trim() };
    if (changed) {
      this.lastError = null;
      this.lastSyncAt = null;
    }
  }

  get name(): string | null {
    return this.config.url ? sourceName(this.config.url) : null;
  }

  get dir(): string | null {
    return this.name ? join(this.handpostRoot(), SOURCES_DIR, this.name) : null;
  }

  /** The extra inbox root for InboxService, once a clone exists. */
  roots(): ExtraRoot[] {
    if (!this.config.enabled || !this.dir || !existsSync(join(this.dir, '.git'))) return [];
    return [{ name: `git:${this.name}`, inbox: join(this.dir, 'inbox'), defaultSource: `git:${this.name}` }];
  }

  /** Clone on first use, then fast-forward pull. Resolves true when the clone is up to date. */
  async sync(): Promise<boolean> {
    if (this.syncing) return this.syncing;
    this.syncing = this.syncUnsafe().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async syncUnsafe(): Promise<boolean> {
    if (!this.config.enabled) return false;
    if (!validGitUrl(this.config.url)) {
      this.lastError =
        'The remote source URL is not a valid Git URL (https://, ssh://, git@host:path or file://).';
      return false;
    }
    const dir = this.dir!;
    try {
      if (!existsSync(join(dir, '.git'))) {
        await mkdir(join(this.handpostRoot(), SOURCES_DIR), { recursive: true });
        await this.git(['clone', '--quiet', '--', this.config.url, dir]);
      } else {
        await this.git(['-C', dir, 'pull', '--ff-only', '--quiet']);
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `Git: ${(error as Error).message}`;
      return false;
    }
  }

  /**
   * Opt-in: copy this source's receipts into `<clone>/receipts/`, commit and push, so cloud-only writers can read
   * them. Only receipts for ids that came from this source are pushed.
   */
  async pushReceipts(ids: string[]): Promise<number> {
    if (!this.config.enabled || !this.config.pushReceipts || !this.dir || !ids.length) return 0;
    const dir = this.dir;
    const local = join(this.handpostRoot(), 'receipts');
    const target = join(dir, 'receipts');
    await mkdir(target, { recursive: true });
    const available = new Set(existsSync(local) ? await readdir(local) : []);
    let copied = 0;
    for (const id of ids)
      if (available.has(`${id}.json`)) {
        await copyFile(join(local, `${id}.json`), join(target, `${id}.json`));
        copied++;
      }
    if (!copied) return 0;
    try {
      await this.git(['-C', dir, 'add', '--', 'receipts']);
      const status = await this.git(['-C', dir, 'status', '--porcelain', '--', 'receipts']);
      if (!status.trim()) return 0;
      await this.git([
        '-C',
        dir,
        '-c',
        'user.name=Handpost',
        '-c',
        'user.email=handpost@localhost',
        'commit',
        '--quiet',
        '-m',
        'Handpost receipts',
        '--',
        'receipts',
      ]);
      await this.git(['-C', dir, 'push', '--quiet']);
      this.lastError = null;
      return copied;
    } catch (error) {
      this.lastError = `Pushing receipts: ${(error as Error).message}`;
      return 0;
    }
  }

  health(): GitHealth {
    const enabled = this.config.enabled;
    return {
      enabled,
      url: this.config.url,
      name: this.name,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      state: !enabled
        ? 'off'
        : this.lastError
          ? this.lastSyncAt
            ? 'warn'
            : 'danger'
          : this.lastSyncAt
            ? 'ok'
            : 'warn',
    };
  }
}
