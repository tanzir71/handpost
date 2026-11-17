/**
 * Account identity: turns the link to your own profile (read after a manual login, or pasted by the owner) into a
 * display handle and the page verification should open. Pure functions — no browser here.
 */
import type { PlatformId } from '../../shared/types';

export interface AccountIdentity {
  /** What the Accounts card shows, e.g. `@tanzir`, `in/tanzir`, `UCabc…`. */
  handle: string;
  /** The page where the account's newest posts appear (verification starts here). */
  profileUrl: string;
}

const HOSTS: Record<Exclude<PlatformId, 'mock'>, string[]> = {
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  bluesky: ['bsky.app'],
  threads: ['threads.net', 'threads.com'],
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com'],
  pinterest: ['pinterest.com'],
};

const RESERVED: Record<string, string[]> = {
  x: ['home', 'explore', 'notifications', 'messages', 'compose', 'settings', 'i', 'search'],
  instagram: ['explore', 'reels', 'direct', 'accounts', 'p', 'stories'],
  pinterest: ['pin-builder', 'pin', 'search', 'ideas', 'settings', 'today'],
  facebook: ['home.php', 'watch', 'groups', 'marketplace', 'gaming', 'settings'],
};

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

/** True when `url` is on one of the platform's own domains (subdomains included). */
export function isPlatformUrl(platform: string, url: URL): boolean {
  const hosts = HOSTS[platform as keyof typeof HOSTS];
  return (
    Boolean(hosts) &&
    url.protocol === 'https:' &&
    hosts!.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

/**
 * Identity from a profile link's path. Host-agnostic on purpose (contract fixtures are served locally); the
 * returned `profileUrl` always uses the platform's real domain.
 */
export function identityFromPath(platform: string, pathname: string, search = ''): AccountIdentity | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const first = parts[0] ?? '';
  switch (platform) {
    case 'x':
      if (parts.length !== 1 || !SEGMENT.test(first) || RESERVED.x!.includes(first)) return null;
      return { handle: `@${first}`, profileUrl: `https://x.com/${first}` };
    case 'linkedin':
      if (first !== 'in' || !parts[1] || !SEGMENT.test(parts[1])) return null;
      return {
        handle: `in/${parts[1]}`,
        profileUrl: `https://www.linkedin.com/in/${parts[1]}/recent-activity/all/`,
      };
    case 'bluesky':
      if (first !== 'profile' || !parts[1] || !SEGMENT.test(parts[1]) || parts[1] === 'me') return null;
      return { handle: `@${parts[1]}`, profileUrl: `https://bsky.app/profile/${parts[1]}` };
    case 'threads':
      if (!first.startsWith('@') || !SEGMENT.test(first.slice(1)) || first === '@me') return null;
      return { handle: first, profileUrl: `https://www.threads.net/${first}` };
    case 'instagram':
      if (parts.length !== 1 || !SEGMENT.test(first) || RESERVED.instagram!.includes(first)) return null;
      return { handle: `@${first}`, profileUrl: `https://www.instagram.com/${first}/` };
    case 'tiktok':
      if (!first.startsWith('@') || !SEGMENT.test(first.slice(1)) || first === '@me') return null;
      return { handle: first, profileUrl: `https://www.tiktok.com/${first}` };
    case 'youtube': {
      const index = parts.indexOf('channel');
      const id = index >= 0 ? parts[index + 1] : undefined;
      if (!id || !/^UC[A-Za-z0-9_-]{10,}$/.test(id)) return null;
      return { handle: id, profileUrl: `https://studio.youtube.com/channel/${id}/videos/short` };
    }
    case 'pinterest':
      if (!SEGMENT.test(first) || RESERVED.pinterest!.includes(first) || first === 'me') return null;
      return { handle: first, profileUrl: `https://www.pinterest.com/${first}/_created/` };
    case 'facebook': {
      if (first === 'profile.php') {
        const id = new URLSearchParams(search).get('id');
        return id && /^\d+$/.test(id)
          ? { handle: id, profileUrl: `https://www.facebook.com/profile.php?id=${id}` }
          : null;
      }
      if (parts.length !== 1 || !SEGMENT.test(first) || RESERVED.facebook!.includes(first) || first === 'me')
        return null;
      return { handle: first, profileUrl: `https://www.facebook.com/${first}` };
    }
    default:
      return null;
  }
}

/** Identity from an absolute URL the owner pasted. Rejects other domains and non-HTTPS links. */
export function identityFromUrl(platform: string, raw: string): AccountIdentity | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!isPlatformUrl(platform, url)) return null;
  return identityFromPath(platform, url.pathname, url.search);
}

/** Matches the placeholder profile URLs earlier versions used (`/me`, `@me`, `channel/UC/`). */
export function isPlaceholderProfile(url: string): boolean {
  return /\/profile\/me\b|\/@me\b|\.com\/me(\/|$)|\/in\/me\/|channel\/UC\/|x\.com\/profile\b/.test(url);
}
