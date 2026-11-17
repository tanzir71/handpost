import { withSelectorFallbacks } from '../selector-fallbacks';
export const xSelectors = withSelectorFallbacks({
  loggedIn: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
  composer: ['[data-testid="tweetTextarea_0"]'],
  text: ['[data-testid="tweetTextarea_0"]'],
  submit: ['[data-testid="tweetButton"]'],
  success: ['[data-testid="toast"]'],
  post: ['[data-testid="tweet"]'],
});
/** The logged-in account's own profile link (handle + profile URL are read from its href). */
export const xIdentity = ['a[data-testid="AppTabBar_Profile_Link"]', '[data-handpost="profile-link"]'];
