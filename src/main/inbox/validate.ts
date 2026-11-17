/** Content and account checks for inbox posts (INBOX_PROTOCOL §6 steps 8 and 10). */
import { postWarnings } from '../../shared/capabilities';
import type { InboxIssue } from '../../shared/inbox-schema';
import type { PlatformId, RenderedPost } from '../../shared/types';
import { getAdapter } from '../adapters';
import type { HandpostDatabase } from '../db/database';
import { CircuitBreaker } from '../scheduler/circuit-breaker';
import type { ResolvedMedia } from './media';
import type { NormalizedPost, NormalizedTarget } from './normalize';

export function renderTarget(target: NormalizedTarget, media: ResolvedMedia[]): RenderedPost {
  return {
    text: target.text,
    ...(target.thread.length ? { thread: target.thread } : {}),
    firstComment: target.firstComment,
    media: media.map((item) => ({
      path: item.source,
      kind: item.kind,
      altText: item.alt,
      sizeBytes: item.sizeBytes,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
      ...(item.durationS ? { durationS: item.durationS } : {}),
    })),
    options: target.options,
  };
}

/** Maps a capability warning sentence to a stable protocol code. */
export function warningCode(message: string): string {
  if (/see more/i.test(message)) return 'text_folds';
  if (/approaching/i.test(message)) return 'near_limit';
  if (/crop/i.test(message)) return 'media_cropped';
  return 'capability_warning';
}

const SIZE_ERROR = /Media exceeds/;

/** Every platform must pass; any error rejects the whole post with `content_invalid` naming the platform. */
export function validateContent(
  post: NormalizedPost,
  media: ResolvedMedia[],
): { errors: InboxIssue[]; warnings: InboxIssue[] } {
  const errors: InboxIssue[] = [];
  const warnings: InboxIssue[] = [];
  for (const target of post.targets) {
    const platform = target.platform as PlatformId;
    const rendered = renderTarget(target, media);
    for (const message of getAdapter(platform).validate(rendered))
      errors.push({
        code: SIZE_ERROR.test(message) ? 'media_too_large' : 'content_invalid',
        platform,
        message: `${platform}: ${message}`,
      });
    for (const message of postWarnings(platform, rendered)) {
      const code = warningCode(message);
      const detail = code === 'text_folds' ? `${message} after ${foldAt(platform)} characters` : message;
      warnings.push({ code, platform, message: detail });
    }
  }
  return { errors, warnings };
}

function foldAt(platform: PlatformId): number {
  return platform === 'linkedin' ? 210 : 0;
}

export interface AccountRef {
  id: number;
  platform: string;
  status: string;
}

export function accountFor(db: HandpostDatabase, platform: string): AccountRef | undefined {
  return db.prepare('SELECT id,platform,status FROM accounts WHERE platform=?').get(platform) as
    AccountRef | undefined;
}

/** Not connected or frozen platforms are accepted with a warning; the scheduler handles them at fire time. */
export function accountWarnings(db: HandpostDatabase, platforms: string[]): InboxIssue[] {
  const warnings: InboxIssue[] = [];
  const breaker = new CircuitBreaker(db);
  for (const platform of platforms) {
    const account = accountFor(db, platform);
    if (account && (account.status === 'frozen' || breaker.isOpen(platform)))
      warnings.push({
        code: 'platform_frozen',
        platform,
        message: `${platform} automation is paused after a detection event; the post will wait for manual handling`,
      });
    else if (!account || account.status !== 'ok')
      warnings.push({
        code: 'platform_not_connected',
        platform,
        message: `${platform} is not connected; log in from Accounts before the post is due`,
      });
  }
  return warnings;
}
