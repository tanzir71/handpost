import { withSelectorFallbacks } from '../selector-fallbacks';
export const facebookSelectors=withSelectorFallbacks({loggedIn:['[aria-label="Your profile"]'],composer:['[role="dialog"]'],text:['[contenteditable="true"][role="textbox"]'],submit:['div[aria-label="Post"]'],success:['[role="alert"]'],post:['[role="article"]']});
