/** The harmless post a Rehearse fills in (it is screenshotted and discarded, never submitted). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { PlatformId } from '../../shared/types';
import type { HandpostDatabase } from '../db/database';
import type { RehearsalInput } from '../scheduler/scheduler';

export const REHEARSAL_TEXT =
  'Handpost rehearsal — this fills the composer to check it still works. It is never posted.';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid square PNG in the paper canvas colour (platforms that need an image get one). */
export function rehearsalPng(size = 1080): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = 0xf4;
    row[2 + x * 3] = 0xef;
    row[3 + x * 3] = 0xe6;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The most recent value used for an option on this platform (e.g. the Facebook Page or Pinterest board). */
function lastOption(db: HandpostDatabase, platform: string, key: string): string | null {
  const rows = db
    .prepare(
      "SELECT t.options_json FROM post_targets t JOIN accounts a ON a.id=t.account_id WHERE a.platform=? AND t.status<>'rehearsal' ORDER BY t.id DESC LIMIT 50",
    )
    .pluck()
    .all(platform) as string[];
  for (const json of rows) {
    try {
      const value = (JSON.parse(json) as Record<string, unknown>)[key];
      if (typeof value === 'string' && value) return value;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Builds the rehearsal post for a platform. Video-only platforms ask for a video (`pickVideo`, returns null when
 * the owner cancels); image platforms get a generated PNG.
 */
export async function rehearsalPost(
  db: HandpostDatabase,
  platform: PlatformId,
  dataDir: string,
  pickVideo: () => Promise<string | null>,
): Promise<RehearsalInput | null> {
  const options: Record<string, string | boolean> = {};
  if (platform === 'facebook') options.pageName = lastOption(db, platform, 'pageName') ?? '';
  if (platform === 'youtube')
    Object.assign(options, { title: 'Handpost rehearsal', madeForKids: false, visibility: 'private' });
  if (platform === 'pinterest')
    Object.assign(options, {
      title: 'Handpost rehearsal',
      destinationUrl: 'https://github.com/tanzir71/handpost',
      board: lastOption(db, platform, 'board') ?? 'Handpost',
    });
  let media: RehearsalInput['media'] = [];
  if (platform === 'tiktok' || platform === 'youtube') {
    const video = await pickVideo();
    if (!video) return null;
    media = [{ path: video, kind: 'video' }];
  } else if (platform === 'instagram' || platform === 'pinterest') {
    const dir = join(dataDir, 'rehearsal');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'rehearsal.png');
    writeFileSync(path, rehearsalPng());
    media = [{ path, kind: 'image', altText: 'A blank paper-coloured square used for a Handpost rehearsal' }];
  }
  return { text: REHEARSAL_TEXT, media, options };
}
