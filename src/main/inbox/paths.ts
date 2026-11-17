/** Handpost folder layout and the inbox ignore rules (INBOX_PROTOCOL §2–3). */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';

export const INBOX_DIR = 'inbox';
export const PROCESSED_DIR = 'processed';
export const REJECTED_DIR = 'rejected';
export const RECEIPTS_DIR = 'receipts';
export const STATUS_FILE = 'handpost.status.json';
export const README_FILE = 'README.txt';
export const WRITER_FILE = 'HANDPOST_WRITER.md';
export const SOURCES_DIR = '.sources';

export function defaultHandpostFolder(home: string = homedir()): string {
  return join(home, 'Handpost');
}

export interface HandpostLayout {
  root: string;
  inbox: string;
  staging: string;
  processed: string;
  rejected: string;
  receipts: string;
  status: string;
}

export function layoutOf(root: string): HandpostLayout {
  return {
    root,
    inbox: join(root, INBOX_DIR),
    staging: join(root, INBOX_DIR, '.tmp'),
    processed: join(root, PROCESSED_DIR),
    rejected: join(root, REJECTED_DIR),
    receipts: join(root, RECEIPTS_DIR),
    status: join(root, STATUS_FILE),
  };
}

export const README_TEXT = `Handpost folder
===============

This folder is how other tools hand posts to the Handpost desktop app.

  inbox/                 Put one post file here (.md with YAML front matter, or .json).
                         Write to inbox/.tmp/ or a *.tmp name first, then rename.
  processed/YYYY-MM/     Accepted files are moved here.
  rejected/              Rejected files, each with a <file>.error.json explaining why.
  receipts/<id>.json     What happened to each post id. Handpost keeps these up to date.
  handpost.status.json   Connected platforms, limits, free slots and recent results.

Anything that can write to inbox/ can publish to your connected accounts.
Keep this folder on your own computer or in a sync service you fully control.

The full protocol: https://github.com/tanzir71/handpost/blob/master/docs/INBOX_PROTOCOL.md
`;

/** Creates the folder structure (idempotent) and the README on first run. */
export function ensureLayout(root: string, extraFiles: Record<string, string> = {}): HandpostLayout {
  const layout = layoutOf(root);
  for (const dir of [layout.inbox, layout.staging, layout.processed, layout.rejected, layout.receipts])
    mkdirSync(dir, { recursive: true });
  const files = { [README_FILE]: README_TEXT, ...extraFiles };
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    if (!existsSync(path)) writeFileSync(path, content, 'utf8');
  }
  return layout;
}

const IGNORED_SUFFIXES = ['.tmp', '.part', '.partial', '.crdownload', '.swp', '~'];
const ACCEPTED_EXTENSIONS = new Set(['.md', '.markdown', '.json']);

/** Splits a path relative to `inbox/` on either separator, so Windows and POSIX inputs behave the same. */
export function segments(relativePath: string): string[] {
  return relativePath.split(/[\\/]+/).filter(Boolean);
}

/**
 * True when Handpost must not read this file as a post: anything under a dot-directory (including
 * `.tmp/`), dotfiles, Office lock files (`~$x`), partial-download suffixes, READMEs and any extension other
 * than .md / .markdown / .json.
 */
export function isIgnoredPath(relativePath: string): boolean {
  const parts = segments(relativePath);
  const name = parts.at(-1);
  if (!name) return true;
  if (parts.some((part) => part.startsWith('.'))) return true;
  if (name.startsWith('~$')) return true;
  const lower = name.toLowerCase();
  if (IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  if (lower.startsWith('readme')) return true;
  return !ACCEPTED_EXTENSIONS.has(extname(lower));
}

/** Directories the recursive scan should not descend into. */
export function isIgnoredDirectory(name: string): boolean {
  return name.startsWith('.');
}
