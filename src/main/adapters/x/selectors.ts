import { withSelectorFallbacks } from '../selector-fallbacks';
export const xSelectors=withSelectorFallbacks({loggedIn:['[data-testid="SideNav_AccountSwitcher_Button"]'],text:['[data-testid="tweetTextarea_0"]'],submit:['[data-testid="tweetButton"]'],success:['[data-testid="toast"]'],post:['[data-testid="tweet"]']});
