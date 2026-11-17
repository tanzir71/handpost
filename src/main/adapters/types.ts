import type { BrowserContext, Page } from 'playwright';
import type { AccountIdentity } from './identity';
import type {
  CapabilityManifest,
  PlatformId,
  PublishResult,
  RenderedPost,
  SessionState,
  Verification,
} from '../../shared/types';
import type { StepReporter } from '../engine/reporter';
export interface PlatformAdapter {
  id: PlatformId;
  capabilities: CapabilityManifest;
  validate(post: RenderedPost): string[];
  checkSession(ctx: BrowserContext): Promise<SessionState>;
  /**
   * Drives the composer. With `{ rehearse: true }` every step up to — never including — submit runs, the filled
   * composer is screenshotted and then discarded.
   */
  publish(
    ctx: BrowserContext,
    post: RenderedPost,
    report: StepReporter,
    options?: PublishOptions,
  ): Promise<PublishResult>;
  verify(ctx: BrowserContext, post: RenderedPost): Promise<Verification>;
  /** Reads the logged-in account's own profile link on the current page (after a manual login). */
  identify?(page: Page): Promise<AccountIdentity | null>;
}
export interface PublishOptions {
  rehearse?: boolean;
}
export interface AdapterSelectors {
  loggedIn: string[];
  challenged: string[];
  composer: string[];
  text: string[];
  file: string[];
  submit: string[];
  success: string[];
  post: string[];
}
export interface AdapterConfig {
  id: PlatformId;
  home: string;
  compose: string;
  /** Where verification starts when the account's own profile URL is not known yet (a real page, never `/me`). */
  profile: string;
  /** Link to the account's own profile; verification follows it when no profile URL is stored. */
  profileLink?: string[];
  /** Own-profile link read after login to capture the handle and profile URL (adapters/<p>/selectors.ts). */
  identity?: string[];
  /** Confirms "discard draft" after a rehearsal (Escape first, then the first of these that exists). */
  discard?: string[];
  permalink?: string[];
  selectors: AdapterSelectors;
  processing?: boolean;
  flowSteps?: Array<{ name: string; selectors: string[]; stage?: 'beforeOptions' | 'afterOptions' }>;
  optionFields?: Array<{
    key: string;
    label: string;
    selectors: string[];
    falseSelectors?: string[];
    type?: 'text' | 'select' | 'toggle';
    afterFlow?: boolean;
    required?: boolean;
  }>;
  comment?: { input: string[]; submit: string[] };
  altText?: { open: string[]; input: string[]; save: string[]; afterFlow?: boolean };
  thread?: { add: string[]; text: string[] };
}
