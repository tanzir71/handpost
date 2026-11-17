import { withSelectorFallbacks } from '../selector-fallbacks';
export const instagramSelectors = withSelectorFallbacks({
  loggedIn: ['[aria-label="Profile"]'],
  composer: ['[role="dialog"]'],
  text: ['textarea[aria-label*="caption"]'],
  submit: ['div[role="button"]:has-text("Share")'],
  success: ['[role="status"]'],
  post: ['article'],
});
