import { withSelectorFallbacks } from '../selector-fallbacks';
export const linkedinSelectors = withSelectorFallbacks({
  loggedIn: ['.global-nav__me'],
  composer: ['.share-box-feed-entry__trigger', '[role="dialog"]'],
  text: ['.ql-editor[contenteditable="true"]'],
  submit: ['button.share-actions__primary-action'],
  success: ['.artdeco-toast-item'],
  post: ['.feed-shared-update-v2'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const linkedinIdentity = [
  '.feed-identity-module__actor-meta a[href*="/in/"]',
  'a.global-nav__primary-link-me-menu-trigger[href*="/in/"]',
  '[data-handpost="profile-link"]',
];
