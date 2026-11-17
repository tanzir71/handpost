import { withSelectorFallbacks } from '../selector-fallbacks';
export const youtubeSelectors = withSelectorFallbacks({
  loggedIn: ['#avatar-btn'],
  composer: ['ytcp-uploads-dialog', 'ytcp-video-upload-progress'],
  text: ['#description-textarea #textbox'],
  submit: ['#done-button'],
  success: ['ytcp-video-upload-progress[upload-status="complete"]'],
  post: ['ytcp-video-row'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const youtubeIdentity = ['a[href*="/channel/UC"]', '[data-handpost="profile-link"]'];
