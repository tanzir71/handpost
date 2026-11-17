import { withSelectorFallbacks } from '../selector-fallbacks';
export const blueskySelectors = withSelectorFallbacks({
  loggedIn: ['[aria-label="Profile"]'],
  composer: ['[aria-label*="New post"]', '[role="dialog"]'],
  text: ['textarea[placeholder*="What"]'],
  submit: ['button:has-text("Post")'],
  success: ['[role="status"]'],
  post: ['article'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const blueskyIdentity = [
  'a[aria-label="Profile"][href^="/profile/"]',
  '[data-handpost="profile-link"]',
];
