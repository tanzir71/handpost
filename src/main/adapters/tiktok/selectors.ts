import { withSelectorFallbacks } from '../selector-fallbacks';
export const tiktokSelectors = withSelectorFallbacks({
  loggedIn: ['[data-e2e="profile-icon"]'],
  composer: ['[data-e2e="upload-card"]', 'form'],
  text: ['[contenteditable="true"]'],
  submit: ['button[data-e2e="post_video_button"]'],
  success: ['[data-e2e="toast"]'],
  post: ['[data-e2e="user-post-item"]'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const tiktokIdentity = ['a[data-e2e="nav-profile"]', '[data-handpost="profile-link"]'];
