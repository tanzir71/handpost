/**
 * Selector fixes (docs/SELECTORS.md). A platform redesign breaks a selector; the owner, or a writer such as Claude
 * working from a failure report, supplies replacement selectors as a patch. Patches written by tools land in
 * `selectors/proposed/` and only take effect after the owner applies them in Accounts → Selectors.
 */
import { z } from 'zod';
import { PLATFORM_IDS } from './types';

export const SELECTOR_PATCH_FORMAT = 'handpost-selectors/1';
export const SELECTOR_REPORT_FORMAT = 'handpost-selector-report/1';
export const MAX_SELECTORS_PER_SLOT = 10;
export const MAX_SELECTOR_LENGTH = 500;

const selector = z
  .string()
  .trim()
  .min(1, 'A selector cannot be empty')
  .max(MAX_SELECTOR_LENGTH, `A selector is at most ${MAX_SELECTOR_LENGTH} characters`)
  .refine((value) => !/[\r\n]/.test(value), 'A selector must be on one line');

const slotKey = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9:. _-]+$/, 'Slot names use letters, digits, spaces and : . _ -');

export const selectorPatchSchema = z
  .object({
    format: z.literal(SELECTOR_PATCH_FORMAT),
    platform: z.enum(PLATFORM_IDS),
    /** Why the change is needed, shown to the owner before applying. */
    note: z.string().max(1000).optional(),
    /** Slot → selectors to try. By default they are added in front of the built-in ones. */
    slots: z
      .record(slotKey, z.array(selector).min(1).max(MAX_SELECTORS_PER_SLOT))
      .refine((value) => Object.keys(value).length <= 60, 'Too many slots'),
    /** Slots whose built-in selectors are dropped, so only the patch's selectors are used. */
    replace: z.array(slotKey).max(60).optional(),
  })
  .strict()
  .refine((patch) => (patch.replace ?? []).every((key) => key in patch.slots), {
    message: 'Every slot in "replace" needs selectors in "slots"',
    path: ['replace'],
  });

export type SelectorPatch = z.infer<typeof selectorPatchSchema>;

/** One overridable selector list of an adapter, as the Selectors dialog shows it. */
export interface SelectorSlotView {
  key: string;
  label: string;
  /** Where in the flow the slot is used (for the owner and for writers). */
  hint: string;
  builtIn: string[];
}

export interface SelectorReportView {
  /** Folder of the report, inside `<Handpost folder>/selectors/reports/<platform>/`. */
  dir: string;
  at: string;
  step: string;
  slots: string[];
  /** `failed`: a step could not find its element. `possible`: a symptom that drift can cause (logged out, unverified). */
  kind: 'failed' | 'possible';
  error: string;
  hasHtml: boolean;
}

export interface SelectorProposalView {
  file: string;
  patch: SelectorPatch | null;
  /** Parse or validation problems; a proposal with errors cannot be applied. */
  errors: string[];
  modifiedAt: string;
}

export interface SelectorsView {
  platform: (typeof PLATFORM_IDS)[number];
  slots: SelectorSlotView[];
  active: SelectorPatch | null;
  proposal: SelectorProposalView | null;
  report: SelectorReportView | null;
  /** Where writers put proposals for this platform. */
  proposalPath: string;
  /** Ready-to-paste instructions for Claude (or any agent) to propose a fix from the latest report. */
  prompt: string;
}

export interface SelectorOverviewRow {
  platform: (typeof PLATFORM_IDS)[number];
  overrides: number;
  proposal: boolean;
  /** `fixedAfter`: the owner saved or applied a fix after this report was written. */
  report: { at: string; step: string; kind: 'failed' | 'possible'; fixedAfter: boolean } | null;
}

export interface SelectorCheckRow {
  slot: string;
  selector: string;
  /** Elements matched in the failure snapshot; null when the selector is not valid. */
  matches: number | null;
  error?: string;
  /** Whether the snapshot was taken at the step that uses this slot (only then is 0 matches meaningful). */
  relevant: boolean;
}

export interface SelectorCheckResult {
  report: string | null;
  rows: SelectorCheckRow[];
}

/** One selector per line, blank lines ignored (the Selectors dialog's text areas). */
export function selectorLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Readable zod errors for files written by other tools. */
export function patchErrors(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
  );
}
