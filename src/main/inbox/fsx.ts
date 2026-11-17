/** Small file-system helpers with the guarantees the inbox protocol promises writers and readers. */
import { randomBytes } from 'node:crypto';
import { closeSync, copyFileSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { mkdir, readdir, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Windows refuses to replace a file while another process (a writer reading its receipt, the search indexer,
 * antivirus) has it open. Those locks are brief, so retry for up to ~5 s before giving up.
 */
async function renameWithRetry(from: string, to: string, attempts = 60): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= attempts || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw error;
      await delay(Math.min(5 * attempt, 100));
    }
  }
}

/**
 * Writes `data` so that a concurrent reader sees either the old file or the complete new one, never a
 * partial write: temp file in the same directory → fsync → rename over the target.
 */
export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  const fd = openSync(temp, 'w');
  try {
    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    await renameWithRetry(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Moves a file, falling back to copy + fsync + unlink when source and target are on different volumes. */
export async function safeMove(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  try {
    await renameWithRetry(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    copyFileSync(from, to);
    const fd = openSync(to, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    await unlink(from);
  }
}

/**
 * A name in `dir` that does not collide with an existing entry, comparing case-insensitively (Windows and
 * macOS file systems are). `post.md` → `post-1.md`, `post-2.md`, …
 */
export async function uniqueName(dir: string, name: string): Promise<string> {
  let existing: Set<string>;
  try {
    existing = new Set((await readdir(dir)).map((entry) => entry.toLowerCase()));
  } catch {
    return name;
  }
  if (!existing.has(name.toLowerCase())) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let index = 1; ; index++) {
    const candidate = `${stem}-${index}${ext}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
}
