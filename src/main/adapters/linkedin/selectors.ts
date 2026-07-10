import { withSelectorFallbacks } from '../selector-fallbacks';
export const linkedinSelectors=withSelectorFallbacks({loggedIn:['.global-nav__me'],composer:['.share-box-feed-entry__trigger','[role="dialog"]'],text:['.ql-editor[contenteditable="true"]'],submit:['button.share-actions__primary-action'],success:['.artdeco-toast-item'],post:['.feed-shared-update-v2']});
