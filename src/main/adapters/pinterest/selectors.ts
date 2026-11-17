import { withSelectorFallbacks } from '../selector-fallbacks';
export const pinterestSelectors = withSelectorFallbacks({
  loggedIn: ['[data-test-id="header-profile"]'],
  composer: ['[data-test-id="pin-builder"]', 'form'],
  text: ['[data-test-id="pin-draft-description"]'],
  submit: ['[data-test-id="board-dropdown-save-button"]'],
  success: ['[data-test-id="toast"]'],
  post: ['[data-test-id="pin"]'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const pinterestIdentity = [
  'a[data-test-id="header-profile-link"]',
  '[data-test-id="header-profile"] a[href]',
  '[data-handpost="profile-link"]',
];
