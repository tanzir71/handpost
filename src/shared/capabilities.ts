import type { CapabilityManifest, PlatformId, RenderedPost } from './types';

export const capabilities: Record<PlatformId, CapabilityManifest> = {
  mock: {
    platform: 'mock',
    label: 'MockSocial',
    maxChars: 1000,
    maxMedia: 4,
    mediaKinds: ['image', 'video'],
  },
  x: {
    platform: 'x',
    label: 'X',
    maxChars: 280,
    maxMedia: 4,
    mediaKinds: ['image', 'video'],
    maxFileBytes: 512 * 1024 * 1024,
    warnings: [{ at: 250, message: 'Approaching X limit' }],
    supportsThreads: true,
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    maxChars: 3000,
    maxMedia: 9,
    mediaKinds: ['image', 'video'],
    warnings: [{ at: 210, message: 'Text will fold behind “see more”' }],
  },
  bluesky: { platform: 'bluesky', label: 'Bluesky', maxChars: 300, maxMedia: 4, mediaKinds: ['image'] },
  threads: {
    platform: 'threads',
    label: 'Threads',
    maxChars: 500,
    maxMedia: 10,
    mediaKinds: ['image', 'video'],
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook Page',
    maxChars: 63206,
    maxMedia: 10,
    mediaKinds: ['image', 'video'],
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    maxChars: 2200,
    maxMedia: 10,
    mediaKinds: ['image'],
    maxFileBytes: 100 * 1024 * 1024,
    conservative: true,
  },
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    maxChars: 2200,
    maxMedia: 1,
    mediaKinds: ['video'],
    maxVideoSeconds: 600,
    maxFileBytes: 4 * 1024 * 1024 * 1024,
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube Shorts',
    maxChars: 5000,
    maxMedia: 1,
    mediaKinds: ['video'],
    maxVideoSeconds: 60,
    maxFileBytes: 256 * 1024 * 1024 * 1024,
  },
  pinterest: {
    platform: 'pinterest',
    label: 'Pinterest',
    maxChars: 500,
    maxMedia: 1,
    mediaKinds: ['image', 'video'],
  },
};

export function countText(platform: PlatformId, text: string): number {
  if (platform === 'x') {
    let count = 0;
    let cursor = 0;
    for (const match of text.matchAll(/https?:\/\/\S+/g)) {
      const index = match.index ?? 0;
      count += xWeightedText(text.slice(cursor, index));
      count += 23;
      cursor = index + match[0].length;
    }
    return count + xWeightedText(text.slice(cursor));
  }
  if (platform === 'bluesky')
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.normalize('NFC'))]
      .length;
  return Array.from(text).length;
}
function xWeightedText(text: string): number {
  let total = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const single =
      code <= 4351 ||
      (code >= 8192 && code <= 8205) ||
      (code >= 8208 && code <= 8223) ||
      (code >= 8242 && code <= 8247);
    total += single ? 1 : 2;
  }
  return total;
}
export function validatePost(platform: PlatformId, post: RenderedPost): string[] {
  const cap = capabilities[platform];
  const errors: string[] = [];
  if (countText(platform, post.text) > cap.maxChars) errors.push(`Text exceeds ${cap.maxChars} characters`);
  if ((post.thread?.length ?? 0) > 0 && !cap.supportsThreads)
    errors.push(`${cap.label} does not support thread continuations`);
  for (const [index, text] of (post.thread ?? []).entries())
    if (countText(platform, text) > cap.maxChars)
      errors.push(`Thread post ${index + 2} exceeds ${cap.maxChars} characters`);
  if (post.media.length > cap.maxMedia) errors.push(`Maximum ${cap.maxMedia} media files`);
  if (post.media.some((m) => !cap.mediaKinds.includes(m.kind)))
    errors.push(`Unsupported media type for ${cap.label}`);
  if (cap.maxFileBytes && post.media.some((m) => (m.sizeBytes ?? 0) > cap.maxFileBytes!))
    errors.push(`Media exceeds ${Math.round(cap.maxFileBytes / 1024 / 1024)} MB`);
  if (
    cap.maxVideoSeconds &&
    post.media.some((m) => m.kind === 'video' && (m.durationS ?? 0) > cap.maxVideoSeconds!)
  )
    errors.push(`Video exceeds ${cap.maxVideoSeconds} seconds`);
  if (platform === 'x' && post.media.some((media) => media.kind === 'video') && post.media.length > 1)
    errors.push('X supports either up to 4 images or one video');
  if (platform === 'instagram' && (post.text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0) > 30)
    errors.push('Instagram supports at most 30 hashtags');
  if (
    platform === 'youtube' &&
    post.media.some(
      (media) => media.kind === 'video' && media.width && media.height && media.width > media.height,
    )
  )
    errors.push('YouTube Shorts video must be vertical or square');
  if (
    (platform === 'instagram' ||
      platform === 'tiktok' ||
      platform === 'youtube' ||
      platform === 'pinterest') &&
    post.media.length === 0
  )
    errors.push(`${cap.label} requires media`);
  return errors;
}

export function postWarnings(platform: PlatformId, post: RenderedPost): string[] {
  const cap = capabilities[platform];
  const warnings: string[] = [];
  const count = countText(platform, post.text);
  for (const warning of cap.warnings ?? [])
    if (count >= warning.at && count <= cap.maxChars) warnings.push(warning.message);
  if (
    platform === 'instagram' &&
    post.media.some(
      (media) =>
        media.width &&
        media.height &&
        (media.width / media.height < 0.8 || media.width / media.height > 1.91),
    )
  )
    warnings.push('Instagram will crop media outside 4:5–1.91:1');
  return warnings;
}

/** Platforms whose adapter posts a first comment once the post is verified (`comment` in adapters/configs.ts). */
export const FIRST_COMMENT_PLATFORMS: readonly PlatformId[] = [
  'x',
  'linkedin',
  'threads',
  'facebook',
  'instagram',
];
