/** Media referenced by inbox posts (INBOX_PROTOCOL §6 step 7, §11). */
import { copyFile, mkdir, open, realpath, rm, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { InboxIssue } from '../../shared/inbox-schema';
import { inspectMedia } from '../media/inspect';

export const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
export const MEDIA_WAIT_MS = 10 * 60_000;

type Family = 'png' | 'jpeg' | 'gif' | 'webp' | 'mp4' | 'webm';
const EXTENSIONS: Record<string, { kind: 'image' | 'video'; family: Family }> = {
  '.png': { kind: 'image', family: 'png' },
  '.jpg': { kind: 'image', family: 'jpeg' },
  '.jpeg': { kind: 'image', family: 'jpeg' },
  '.gif': { kind: 'image', family: 'gif' },
  '.webp': { kind: 'image', family: 'webp' },
  '.mp4': { kind: 'video', family: 'mp4' },
  '.mov': { kind: 'video', family: 'mp4' },
  '.webm': { kind: 'video', family: 'webm' },
};

/** Identifies a file by its first bytes. MP4 and QuickTime share the ISO base media layout. */
export function sniff(head: Uint8Array): Family | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 8 && head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (head.length >= 8 && ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii(4, 8)))
    return 'mp4';
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return 'webm';
  return null;
}

/** True when `child` is `root` itself or inside it (case-insensitive where the platform is). */
export function isInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Writers use forward slashes; Windows writers sometimes send backslashes. Both mean the same path. */
export function normalizeMediaPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export interface ResolvedMedia {
  /** Real path of the file in the inbox (or outside it, when allowed). */
  source: string;
  /** Lexical absolute path as referenced (what later files would reference too). */
  referenced: string;
  kind: 'image' | 'video';
  sizeBytes: number;
  width?: number | undefined;
  height?: number | undefined;
  durationS?: number | undefined;
  alt: string | null;
}

export type MediaCheck =
  | { state: 'ok'; items: ResolvedMedia[] }
  | { state: 'waiting'; missing: string[] }
  | { state: 'rejected'; issues: InboxIssue[] };

export interface MediaOptions {
  /** Directory the post file is in; media paths are relative to it. */
  baseDir: string;
  /** The inbox root media must stay inside. */
  inboxRoot: string;
  allowOutside: boolean;
}

async function readHead(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function resolveMedia(
  media: Array<{ path: string; alt: string | null }>,
  options: MediaOptions,
): Promise<MediaCheck> {
  const issues: InboxIssue[] = [];
  const missing: string[] = [];
  const items: ResolvedMedia[] = [];
  let realRoot: string;
  try {
    realRoot = await realpath(options.inboxRoot);
  } catch {
    realRoot = resolve(options.inboxRoot);
  }
  for (const [index, entry] of media.entries()) {
    const pointer = `/media/${index}/path`;
    const written = normalizeMediaPath(entry.path);
    const referenced = resolve(options.baseDir, written);
    const outside = () =>
      issues.push({
        code: 'media_outside_root',
        message: `${written} is outside the inbox folder`,
        path: pointer,
      });
    if (!options.allowOutside && !isInside(resolve(options.inboxRoot), referenced)) {
      outside();
      continue;
    }
    let real: string;
    try {
      real = await realpath(referenced);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') missing.push(written);
      else issues.push({ code: 'media_unsupported', message: `${written} cannot be read`, path: pointer });
      continue;
    }
    if (!options.allowOutside && !isInside(realRoot, real)) {
      outside();
      continue;
    }
    const info = await stat(real);
    if (!info.isFile()) {
      issues.push({ code: 'media_unsupported', message: `${written} is not a file`, path: pointer });
      continue;
    }
    const type = EXTENSIONS[extname(real).toLowerCase()];
    if (!type) {
      issues.push({
        code: 'media_unsupported',
        message: `${written}: only png, jpg, gif, webp, mp4, mov and webm are supported`,
        path: pointer,
      });
      continue;
    }
    if (sniff(await readHead(real)) !== type.family) {
      issues.push({
        code: 'media_unsupported',
        message: `${written} does not contain ${type.family.toUpperCase()} data`,
        path: pointer,
      });
      continue;
    }
    if (info.size > MAX_MEDIA_BYTES) {
      issues.push({ code: 'media_too_large', message: `${written} is larger than 512 MB`, path: pointer });
      continue;
    }
    const probed = await inspectMedia(real);
    items.push({
      source: real,
      referenced,
      kind: type.kind,
      sizeBytes: info.size,
      width: probed.width,
      height: probed.height,
      durationS: probed.durationS,
      alt: entry.alt,
    });
  }
  if (issues.length) return { state: 'rejected', issues };
  if (missing.length) return { state: 'waiting', missing };
  return { state: 'ok', items };
}

/**
 * Copies resolved media into the app's managed store before the DB transaction, so a crash can leave at
 * most an unreferenced copy, never a row pointing at a file in the inbox that is about to move.
 */
export async function copyIntoStore(items: ResolvedMedia[], storeDir: string): Promise<string[]> {
  await rm(storeDir, { recursive: true, force: true });
  await mkdir(storeDir, { recursive: true });
  const paths: string[] = [];
  for (const [index, item] of items.entries()) {
    const target = join(storeDir, `${index}-${basename(item.source).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    await copyFile(item.source, target);
    paths.push(target);
  }
  return paths;
}
