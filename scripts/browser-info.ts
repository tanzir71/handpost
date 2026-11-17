/** Prints which browser Handpost would drive and its version (no launch). `npx tsx scripts/browser-info.ts` */
import { resolveBrowserChannel } from '../src/main/engine/browser';
import { detectBrowser } from '../src/main/engine/browser-detect';

const channel = resolveBrowserChannel(process.env.HANDPOST_BROWSER);
console.log(
  JSON.stringify(
    { chosen: detectBrowser(channel), chrome: detectBrowser('chrome'), edge: detectBrowser('msedge') },
    null,
    2,
  ),
);
