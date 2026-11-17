import type { Page } from 'playwright';
import type { PlatformId } from '../../shared/types';
import type { HandpostDatabase } from '../db/database';
import type { PlatformAdapter } from '../adapters/types';

/**
 * Stores the handle and profile URL read from the logged-in page. Never overwrites a profile URL the owner set
 * (e.g. a Facebook Page rather than the personal profile), and Facebook is never auto-captured for that reason.
 */
export async function captureIdentity(
  db: HandpostDatabase,
  platform: PlatformId,
  adapter: Pick<PlatformAdapter, 'identify'>,
  page: Page,
): Promise<boolean> {
  if (platform === 'facebook' || platform === 'mock' || !adapter.identify) return false;
  const identity = await adapter.identify(page).catch(() => null);
  if (!identity) return false;
  db.prepare('UPDATE accounts SET handle=?,profile_url=COALESCE(profile_url,?) WHERE platform=?').run(
    identity.handle,
    identity.profileUrl,
    platform,
  );
  return true;
}
