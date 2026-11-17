import { withSelectorFallbacks } from '../selector-fallbacks';
export const facebookSelectors = withSelectorFallbacks({
  loggedIn: ['[aria-label="Your profile"]'],
  composer: ['[role="dialog"]'],
  text: ['[contenteditable="true"][role="textbox"]'],
  submit: ['div[aria-label="Post"]'],
  success: ['[role="alert"]'],
  post: ['[role="article"]'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const facebookIdentity = ['a[aria-label="Your profile"][href]', '[data-handpost="profile-link"]'];
