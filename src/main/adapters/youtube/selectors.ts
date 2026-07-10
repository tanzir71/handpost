import { withSelectorFallbacks } from '../selector-fallbacks';
export const youtubeSelectors=withSelectorFallbacks({loggedIn:['#avatar-btn'],composer:['ytcp-uploads-dialog','ytcp-video-upload-progress'],text:['#description-textarea #textbox'],submit:['#done-button'],success:['ytcp-video-upload-progress[upload-status="complete"]'],post:['ytcp-video-row']});
