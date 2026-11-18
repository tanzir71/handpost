/**
 * The overridable selector lists ("slots") of an adapter config, and how a selector patch changes them.
 * Slot keys are stable names writers and the owner use: `text`, `submit`, `comment.input`, `flow:confirm crop`,
 * `option:title`, `option:madeForKids:false` …
 */
import type { SelectorPatch, SelectorSlotView } from '../../shared/selectors';
import type { AdapterConfig, AdapterSelectors } from './types';

const CORE: Array<[keyof AdapterSelectors, string, string]> = [
  ['loggedIn', 'Logged-in marker', 'Home page: present only when the account is logged in'],
  ['challenged', 'Challenge marker', 'Home page: a captcha or checkpoint the owner must complete'],
  ['composer', 'Composer', 'Compose page: waited for before typing'],
  ['text', 'Post text box', 'Compose page: where the post text is typed'],
  ['file', 'File input', 'Compose page: receives images and videos'],
  ['submit', 'Post button', 'Compose page: clicked to publish (never during Rehearse)'],
  ['success', 'Success signal', 'After Post: confirms the platform accepted it'],
  ['post', 'Post on profile', 'Own profile: each published post, matched by its text'],
];

type Getter = (config: AdapterConfig) => string[] | undefined;
type Setter = (config: AdapterConfig, value: string[]) => void;
interface SlotDef {
  key: string;
  label: string;
  hint: string;
  get: Getter;
  set: Setter;
}

function definitions(config: AdapterConfig): SlotDef[] {
  const defs: SlotDef[] = CORE.map(([key, label, hint]) => ({
    key,
    label,
    hint,
    get: (c) => c.selectors[key],
    set: (c, v) => {
      c.selectors[key] = v;
    },
  }));
  const optional = (
    key: string,
    label: string,
    hint: string,
    get: Getter,
    set: Setter,
    present = Boolean(get(config)?.length),
  ) => {
    if (present) defs.push({ key, label, hint, get, set });
  };
  optional(
    'identity',
    'Own profile link (login)',
    'After login: read for the handle and profile URL',
    (c) => c.identity,
    (c, v) => (c.identity = v),
  );
  optional(
    'profileLink',
    'Own profile link (verify)',
    'Verification: followed when no profile URL is stored',
    (c) => c.profileLink,
    (c, v) => (c.profileLink = v),
  );
  optional(
    'permalink',
    'Permalink inside a post',
    'Verification: the link to the published post',
    (c) => c.permalink,
    (c, v) => (c.permalink = v),
    true,
  );
  optional(
    'discard',
    'Discard confirmation',
    'Rehearse: confirms throwing the draft away',
    (c) => c.discard,
    (c, v) => (c.discard = v),
    true,
  );
  if (config.comment) {
    optional(
      'comment.input',
      'First comment box',
      'Own post: where the first comment is typed',
      (c) => c.comment?.input,
      (c, v) => (c.comment!.input = v),
    );
    optional(
      'comment.submit',
      'First comment button',
      'Own post: sends the first comment',
      (c) => c.comment?.submit,
      (c, v) => (c.comment!.submit = v),
    );
  }
  if (config.altText) {
    optional(
      'altText.open',
      'Alt text: open',
      'Compose page: opens the image description editor',
      (c) => c.altText?.open,
      (c, v) => (c.altText!.open = v),
    );
    optional(
      'altText.input',
      'Alt text: field',
      'Compose page: image description field',
      (c) => c.altText?.input,
      (c, v) => (c.altText!.input = v),
    );
    optional(
      'altText.save',
      'Alt text: save',
      'Compose page: saves the description',
      (c) => c.altText?.save,
      (c, v) => (c.altText!.save = v),
    );
  }
  if (config.thread) {
    optional(
      'thread.add',
      'Thread: add post',
      'Compose page: adds the next post of a thread',
      (c) => c.thread?.add,
      (c, v) => (c.thread!.add = v),
    );
    optional(
      'thread.text',
      'Thread: post text boxes',
      'Compose page: text boxes of the thread',
      (c) => c.thread?.text,
      (c, v) => (c.thread!.text = v),
    );
  }
  for (const step of config.flowSteps ?? [])
    defs.push({
      key: `flow:${step.name}`,
      label: `Step: ${step.name}`,
      hint: 'Compose flow: clicked to move on',
      get: (c) => c.flowSteps?.find((item) => item.name === step.name)?.selectors,
      set: (c, v) => {
        const target = c.flowSteps?.find((item) => item.name === step.name);
        if (target) target.selectors = v;
      },
    });
  for (const field of config.optionFields ?? []) {
    defs.push({
      key: `option:${field.key}`,
      label: `Option: ${field.label}`,
      hint:
        field.type === 'toggle'
          ? 'Compose flow: clicked when the option is on'
          : 'Compose flow: filled with the option',
      get: (c) => c.optionFields?.find((item) => item.key === field.key)?.selectors,
      set: (c, v) => {
        const target = c.optionFields?.find((item) => item.key === field.key);
        if (target) target.selectors = v;
      },
    });
    if (field.falseSelectors)
      defs.push({
        key: `option:${field.key}:false`,
        label: `Option: ${field.label} (off)`,
        hint: 'Compose flow: clicked when the option is off',
        get: (c) => c.optionFields?.find((item) => item.key === field.key)?.falseSelectors,
        set: (c, v) => {
          const target = c.optionFields?.find((item) => item.key === field.key);
          if (target) target.falseSelectors = v;
        },
      });
  }
  return defs;
}

/** Defaults the factory uses when a config leaves these out (factory.ts). */
const IMPLICIT: Record<string, string[]> = {
  permalink: ['a[href]'],
  discard: [
    'button:has-text("Discard")',
    'div[role="button"]:has-text("Discard")',
    '[data-testid="confirmationSheetConfirm"]',
    '[data-handpost="discard"]',
  ],
};

export function listSlots(config: AdapterConfig): SelectorSlotView[] {
  return definitions(config).map(({ key, label, hint, get }) => ({
    key,
    label,
    hint,
    builtIn: [...(get(config) ?? IMPLICIT[key] ?? [])],
  }));
}

/** Slot keys in a patch that this platform does not have. */
export function unknownSlots(config: AdapterConfig, patch: SelectorPatch): string[] {
  const known = new Set(definitions(config).map((def) => def.key));
  return Object.keys(patch.slots).filter((key) => !known.has(key));
}

/**
 * A copy of `config` with the patch applied: patch selectors come first and the built-in ones stay as alternatives,
 * unless the slot is listed in `replace`. The original config is never modified.
 */
export function applyPatch(config: AdapterConfig, patch: SelectorPatch | null | undefined): AdapterConfig {
  if (!patch) return config;
  const copy = structuredClone(config);
  const replace = new Set(patch.replace ?? []);
  for (const def of definitions(copy)) {
    const extra = patch.slots[def.key];
    if (!extra?.length) continue;
    const current = def.get(copy) ?? IMPLICIT[def.key] ?? [];
    const merged = replace.has(def.key)
      ? [...extra]
      : [...extra, ...current.filter((item) => !extra.includes(item))];
    def.set(copy, merged);
  }
  return copy;
}

/** The slots a failed step depends on (step names come from factory.ts and the scheduler). */
export function slotsForStep(config: AdapterConfig, step: string): string[] {
  const keys = new Set(definitions(config).map((def) => def.key));
  const pick = (...candidates: string[]) => candidates.filter((key) => keys.has(key));
  if (step === 'open composer') return pick('composer');
  if (step === 'fill text') return pick('text');
  if (step === 'upload media') return pick('file');
  if (step === 'add media alt text') return pick('altText.open', 'altText.input', 'altText.save');
  if (/^add thread post/.test(step)) return pick('thread.add', 'thread.text');
  if (step === 'submit') return pick('submit');
  if (step === 'wait for success' || step === 'wait for processing') return pick('success');
  if (step === 'discard draft') return pick('discard');
  if (step === 'check session') return pick('loggedIn', 'challenged');
  if (step === 'verify on own profile') return pick('post', 'permalink', 'profileLink');
  if (step === 'post first comment') return pick('comment.input', 'comment.submit');
  const flow = config.flowSteps?.find((item) => item.name === step);
  if (flow) return pick(`flow:${flow.name}`);
  const field = config.optionFields?.find((item) => step === `set ${item.label}`);
  if (field) return pick(`option:${field.key}`, `option:${field.key}:false`);
  return [];
}

/** The selectors a slot currently resolves to (built-in plus any patch). */
export function slotSelectors(config: AdapterConfig, key: string): string[] {
  const def = definitions(config).find((item) => item.key === key);
  return def ? [...(def.get(config) ?? IMPLICIT[key] ?? [])] : [];
}
