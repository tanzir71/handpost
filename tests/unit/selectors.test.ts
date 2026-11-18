import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { buildSelectorsJsonSchema, serializeSchema } from '../../scripts/schema';
import { adapterConfigs } from '../../src/main/adapters/configs';
import {
  applyPatch,
  listSlots,
  slotSelectors,
  slotsForStep,
  unknownSlots,
} from '../../src/main/adapters/slots';
import { sanitizeForRepair } from '../../src/main/engine/sanitize';
import { isSelectorFailure } from '../../src/main/selectors/service';
import { selectorLines, selectorPatchSchema, type SelectorPatch } from '../../src/shared/selectors';

const config = (id: string) => adapterConfigs.find((item) => item.id === id)!;
const patch = (platform: SelectorPatch['platform'], slots: SelectorPatch['slots'], replace?: string[]) =>
  selectorPatchSchema.parse({
    format: 'handpost-selectors/1',
    platform,
    slots,
    ...(replace ? { replace } : {}),
  });

describe('selector slots', () => {
  it('lists every overridable selector list of a platform with its built-in selectors', () => {
    const x = listSlots(config('x'));
    const keys = x.map((slot) => slot.key);
    for (const key of [
      'loggedIn',
      'composer',
      'text',
      'submit',
      'success',
      'post',
      'identity',
      'profileLink',
    ])
      expect(keys).toContain(key);
    for (const key of [
      'permalink',
      'discard',
      'comment.input',
      'comment.submit',
      'altText.open',
      'thread.add',
    ])
      expect(keys).toContain(key);
    expect(x.find((slot) => slot.key === 'text')!.builtIn[0]).toBe('[data-testid="tweetTextarea_0"]');
    const youtube = listSlots(config('youtube')).map((slot) => slot.key);
    expect(youtube).toEqual(
      expect.arrayContaining([
        'flow:continue upload wizard',
        'option:title',
        'option:madeForKids',
        'option:madeForKids:false',
        'option:visibility',
      ]),
    );
    expect(youtube).not.toContain('comment.input');
  });

  it('puts patch selectors first and keeps the built-in ones unless the slot is replaced', () => {
    const original = config('x');
    const before = JSON.stringify(original);
    const added = applyPatch(original, patch('x', { text: ['div.new-editor'] }));
    expect(added.selectors.text[0]).toBe('div.new-editor');
    expect(added.selectors.text).toContain('[data-testid="tweetTextarea_0"]');
    const replaced = applyPatch(original, patch('x', { submit: ['button.send'] }, ['submit']));
    expect(replaced.selectors.submit).toEqual(['button.send']);
    expect(replaced.selectors.text).toEqual(original.selectors.text);
    const nested = applyPatch(
      original,
      patch('x', { 'comment.submit': ['button.reply'], permalink: ['a.time'] }),
    );
    expect(nested.comment!.submit[0]).toBe('button.reply');
    expect(nested.permalink![0]).toBe('a.time');
    expect(JSON.stringify(original)).toBe(before);
  });

  it('patches flow steps, options and their "off" selectors, and the implicit defaults', () => {
    const youtube = applyPatch(
      config('youtube'),
      patch('youtube', {
        'flow:continue upload wizard': ['#next'],
        'option:madeForKids:false': ['#not-for-kids'],
      }),
    );
    expect(youtube.flowSteps![0]!.selectors[0]).toBe('#next');
    expect(youtube.optionFields!.find((field) => field.key === 'madeForKids')!.falseSelectors![0]).toBe(
      '#not-for-kids',
    );
    const linkedin = applyPatch(config('linkedin'), patch('linkedin', { discard: ['button.drop'] }));
    expect(linkedin.discard![0]).toBe('button.drop');
    expect(linkedin.discard).toContain('button:has-text("Discard")');
    expect(slotSelectors(linkedin, 'discard')[0]).toBe('button.drop');
  });

  it('names slots a platform does not have', () => {
    expect(
      unknownSlots(config('bluesky'), patch('bluesky', { text: ['x'], 'comment.input': ['y'] })),
    ).toEqual(['comment.input']);
  });

  it('maps failed steps to the slots they use', () => {
    expect(slotsForStep(config('x'), 'fill text')).toEqual(['text']);
    expect(slotsForStep(config('x'), 'add thread post 2')).toEqual(['thread.add', 'thread.text']);
    expect(slotsForStep(config('x'), 'verify on own profile')).toEqual(['post', 'permalink', 'profileLink']);
    expect(slotsForStep(config('youtube'), 'set Short title')).toEqual(['option:title']);
    expect(slotsForStep(config('youtube'), 'set Audience')).toEqual([
      'option:madeForKids',
      'option:madeForKids:false',
    ]);
    expect(slotsForStep(config('pinterest'), 'select board result')).toEqual(['flow:select board result']);
    expect(slotsForStep(config('x'), 'check session')).toEqual(['loggedIn', 'challenged']);
    expect(slotsForStep(config('x'), 'screenshot filled composer')).toEqual([]);
  });
});

describe('handpost-selectors/1 files', () => {
  const base = { format: 'handpost-selectors/1', platform: 'x' };
  it('accepts a minimal patch and trims selectors', () => {
    const parsed = selectorPatchSchema.parse({ ...base, slots: { text: ['  div[role="textbox"]  '] } });
    expect(parsed.slots.text).toEqual(['div[role="textbox"]']);
  });
  it.each([
    ['a multi-line selector', { ...base, slots: { text: ['a\nb'] } }],
    ['an empty selector', { ...base, slots: { text: [' '] } }],
    ['an empty slot', { ...base, slots: { text: [] } }],
    ['eleven selectors', { ...base, slots: { text: Array.from({ length: 11 }, (_, i) => `#s${i}`) } }],
    ['a replace without selectors', { ...base, slots: { text: ['#a'] }, replace: ['submit'] }],
    ['another format', { ...base, format: 'handpost/1', slots: { text: ['#a'] } }],
    ['an unknown platform', { ...base, platform: 'myspace', slots: { text: ['#a'] } }],
    ['an unknown field', { ...base, slots: { text: ['#a'] }, script: 'alert(1)' }],
  ])('rejects %s', (_label, value) => {
    expect(selectorPatchSchema.safeParse(value).success).toBe(false);
  });
  it('splits the dialog text into one selector per line', () => {
    expect(selectorLines('a\r\n\n  b  \n')).toEqual(['a', 'b']);
  });
});

describe('selector failures', () => {
  it('recognises locators that found nothing and invalid selectors', () => {
    expect(isSelectorFailure(new Error('locator.fill: Timeout 30000ms exceeded.\nCall log:'))).toBe(true);
    expect(isSelectorFailure(new Error("waiting for locator('[data-testid=x]').first()"))).toBe(true);
    expect(isSelectorFailure(new Error('Unexpected token "]" while parsing selector "a]"'))).toBe(true);
    expect(isSelectorFailure(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(false);
    expect(isSelectorFailure(new Error('Session logged_out'))).toBe(false);
  });
});

describe('repair snapshots', () => {
  const long = 'My private draft about the quarterly numbers that nobody should read';
  const html = `<html><head><style>.a{color:red}</style><script>window.token="abc"</script></head><body>
<div data-testid="tweetTextarea_0" aria-label="${'A'.repeat(120)}" style="color: red">${long}</div>
<button data-testid="tweetButton">Post</button>
<a href="/someone/status/1?ref=email&amp;t=secret#reply">link</a>
<img src="data:image/png;base64,AAAA" srcset="a.png 1x, b.png 2x" alt="ok">
<input name="q" value="typed search">
<svg><path d="M0 0L10 10Z"/></svg></body></html>`;
  const clean = sanitizeForRepair(html);
  it('keeps the structure and the short labels selectors need', () => {
    expect(clean).toContain('data-testid="tweetTextarea_0"');
    expect(clean).toContain('<button data-testid="tweetButton">Post</button>');
    expect(clean).toContain('href="/someone/status/1"');
    expect(clean).toContain('name="q"');
  });
  it('drops scripts, styles, long text, long attribute values, values, query strings and data URIs', () => {
    expect(clean).not.toContain(long);
    expect(clean).toContain(`[text, ${long.length} chars]`);
    expect(clean).toContain('aria-label="[120 chars]"');
    for (const gone of [
      'window.token',
      'color:red',
      'color: red',
      'typed search',
      'ref=email',
      'secret',
      'AAAA',
      'srcset',
      'M0 0',
    ])
      expect(clean).not.toContain(gone);
  });
});

describe('published selector schema and guide', () => {
  const published = readFileSync('schema/handpost-selectors.v1.schema.json', 'utf8');
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(published));
  it('equals what the zod schema generates (run npm run schema after changing it)', () => {
    expect(published).toBe(serializeSchema(buildSelectorsJsonSchema()));
  });
  it('agrees with the zod schema on the shape of a file', () => {
    const base = { format: 'handpost-selectors/1', platform: 'x' };
    const cases: Array<[unknown, boolean]> = [
      [{ ...base, slots: { text: ['#a'] } }, true],
      [
        { ...base, note: 'n', slots: { 'flow:confirm crop': ['#a', '#b'] }, replace: ['flow:confirm crop'] },
        true,
      ],
      [{ ...base, slots: {} }, true],
      [{ ...base }, false],
      [{ ...base, slots: { text: [] } }, false],
      [{ ...base, slots: { text: [''] } }, false],
      [{ ...base, slots: { 'bad/slot': ['#a'] } }, false],
      [{ ...base, platform: 'twitter', slots: { text: ['#a'] } }, false],
      [{ ...base, slots: { text: ['#a'] }, extra: true }, false],
    ];
    for (const [value, valid] of cases) {
      expect(validate(value), JSON.stringify(value)).toBe(valid);
      expect(selectorPatchSchema.safeParse(value).success, JSON.stringify(value)).toBe(valid);
    }
  });
  it('the example in the handpost-selectors skill is a valid fix for X', () => {
    const skill = readFileSync('integrations/claude/handpost-selectors/SKILL.md', 'utf8');
    const example = /```json\n([\s\S]*?)\n```/.exec(skill)![1]!;
    const value = JSON.parse(example);
    expect(validate(value)).toBe(true);
    const parsed = selectorPatchSchema.parse(value);
    expect(unknownSlots(config(parsed.platform), parsed)).toEqual([]);
    for (const slot of ['loggedIn', 'submit', 'comment.input', 'flow:<step name>', 'option:<key>:false'])
      expect(skill).toContain(`\`${slot}\``);
  });
  it('the skill ships with the app and is written next to the reports', () => {
    expect(readFileSync('scripts/copy-assets.ts', 'utf8')).toContain(
      "'integrations/claude/handpost-selectors/SKILL.md', 'dist/main/integrations/HANDPOST_SELECTORS.md'",
    );
  });
});
