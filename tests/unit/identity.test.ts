import { describe, expect, it } from 'vitest';
import { adapterConfigs } from '../../src/main/adapters/configs';
import { identityFromPath, identityFromUrl, isPlaceholderProfile } from '../../src/main/adapters/identity';

describe('account identity from the own-profile link', () => {
  const cases: Array<[string, string, string, string]> = [
    ['x', '/tanzir', '@tanzir', 'https://x.com/tanzir'],
    [
      'linkedin',
      '/in/tanzir-rahman/',
      'in/tanzir-rahman',
      'https://www.linkedin.com/in/tanzir-rahman/recent-activity/all/',
    ],
    [
      'bluesky',
      '/profile/tanzir.bsky.social',
      '@tanzir.bsky.social',
      'https://bsky.app/profile/tanzir.bsky.social',
    ],
    ['threads', '/@tanzir', '@tanzir', 'https://www.threads.net/@tanzir'],
    ['facebook', '/handpostapp', 'handpostapp', 'https://www.facebook.com/handpostapp'],
    ['instagram', '/tanzir.makes/', '@tanzir.makes', 'https://www.instagram.com/tanzir.makes/'],
    ['tiktok', '/@tanzir', '@tanzir', 'https://www.tiktok.com/@tanzir'],
    [
      'youtube',
      '/channel/UC1234567890abcdefghij',
      'UC1234567890abcdefghij',
      'https://studio.youtube.com/channel/UC1234567890abcdefghij/videos/short',
    ],
    ['pinterest', '/tanzir/', 'tanzir', 'https://www.pinterest.com/tanzir/_created/'],
  ];
  it.each(cases)('%s: %s → %s', (platform, path, handle, profileUrl) => {
    expect(identityFromPath(platform, path)).toEqual({ handle, profileUrl });
  });
  it('reads a numeric Facebook profile id from the query', () => {
    expect(identityFromPath('facebook', '/profile.php', '?id=1000123')).toEqual({
      handle: '1000123',
      profileUrl: 'https://www.facebook.com/profile.php?id=1000123',
    });
  });
  it('rejects placeholders and navigation paths', () => {
    for (const [platform, path] of [
      ['x', '/home'],
      ['x', '/i/flow/login'],
      ['bluesky', '/profile/me'],
      ['threads', '/@me'],
      ['tiktok', '/@me'],
      ['youtube', '/channel/UC'],
      ['instagram', '/explore/'],
      ['pinterest', '/pin-builder/'],
      ['linkedin', '/feed/'],
      ['facebook', '/me'],
    ])
      expect(identityFromPath(platform!, path!), `${platform} ${path}`).toBeNull();
  });
});

describe('profile URL the owner pastes', () => {
  it('accepts HTTPS links on the platform domain (and subdomains)', () => {
    expect(identityFromUrl('x', 'https://x.com/tanzir')?.handle).toBe('@tanzir');
    expect(identityFromUrl('x', 'https://twitter.com/tanzir')?.handle).toBe('@tanzir');
    expect(identityFromUrl('linkedin', ' https://www.linkedin.com/in/tanzir/ ')?.handle).toBe('in/tanzir');
  });
  it('rejects other domains, look-alikes and plain HTTP', () => {
    expect(identityFromUrl('x', 'https://evil.example/tanzir')).toBeNull();
    expect(identityFromUrl('x', 'https://x.com.evil.example/tanzir')).toBeNull();
    expect(identityFromUrl('bluesky', 'http://bsky.app/profile/tanzir.bsky.social')).toBeNull();
    expect(identityFromUrl('x', 'not a url')).toBeNull();
  });
});

describe('adapter configs', () => {
  it('contain no placeholder profile URLs', () => {
    for (const config of adapterConfigs) {
      expect(isPlaceholderProfile(config.profile), `${config.id}: ${config.profile}`).toBe(false);
      expect(config.profile.startsWith('http'), config.id).toBe(true);
    }
    expect(isPlaceholderProfile('https://bsky.app/profile/me')).toBe(true);
    expect(isPlaceholderProfile('https://www.threads.net/@me')).toBe(true);
    expect(isPlaceholderProfile('https://x.com/profile')).toBe(true);
  });
  it('give every real platform own-profile identity selectors with a fixture fallback', () => {
    for (const config of adapterConfigs.filter((item) => item.id !== 'mock')) {
      expect(config.identity?.length, config.id).toBeGreaterThanOrEqual(2);
      expect(config.identity!.at(-1)).toBe('[data-handpost="profile-link"]');
    }
  });
});
