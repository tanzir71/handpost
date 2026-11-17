import { withSelectorFallbacks } from '../selector-fallbacks';
export const threadsSelectors = withSelectorFallbacks({
  loggedIn: ['[aria-label="Profile"]'],
  composer: ['[aria-label*="Create"]', '[role="dialog"]'],
  text: ['[contenteditable="true"]'],
  submit: ['div[role="button"]:has-text("Post")'],
  success: ['[role="status"]'],
  post: ['article'],
});
