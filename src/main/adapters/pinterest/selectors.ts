import { withSelectorFallbacks } from '../selector-fallbacks';
export const pinterestSelectors=withSelectorFallbacks({loggedIn:['[data-test-id="header-profile"]'],composer:['[data-test-id="pin-builder"]','form'],text:['[data-test-id="pin-draft-description"]'],submit:['[data-test-id="board-dropdown-save-button"]'],success:['[data-test-id="toast"]'],post:['[data-test-id="pin"]']});
