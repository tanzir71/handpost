import { withSelectorFallbacks } from '../selector-fallbacks';
export const instagramSelectors = withSelectorFallbacks({
  loggedIn: ['[aria-label="Profile"]'],
  composer: ['[role="dialog"]'],
  text: ['textarea[aria-label*="caption"]'],
  submit: ['div[role="button"]:has-text("Share")'],
  success: ['[role="status"]'],
  post: ['article'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const instagramIdentity = [
  'a[role="link"][href^="/"]:has(img[alt*="profile picture"])',
  '[data-handpost="profile-link"]',
];
