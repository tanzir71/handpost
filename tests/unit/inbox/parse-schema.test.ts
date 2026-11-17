import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { datesToIso, parseInboxFile } from '../../../src/main/inbox/parse';
import { isIgnoredPath } from '../../../src/main/inbox/paths';
import {
  crossFieldIssues,
  defaultInboxSchemas,
  zodIssues,
  type InboxPost,
} from '../../../src/shared/inbox-schema';

const fixtures = join(process.cwd(), 'tests', 'fixtures', 'inbox');
const bytes = (text: string) => Buffer.from(text, 'utf8');

function parse(name: string, text: string | Buffer) {
  return parseInboxFile(name, typeof text === 'string' ? bytes(text) : text);
}

describe('inbox discovery rules', () => {
  it('accepts .md, .markdown and .json at any depth with either separator', () => {
    for (const path of ['post.md', 'a/b/post.markdown', 'batch.json', 'sub\\post.md', 'UPPER.MD'])
      expect(isIgnoredPath(path), path).toBe(false);
  });
  it('ignores temp, partial, dot, lock, README and unrelated files', () => {
    for (const path of [
      'post.md.tmp',
      'post.tmp',
      'post.md.part',
      'x.partial',
      'video.crdownload',
      '.post.md.swp',
      'post.md~',
      '.hidden.md',
      '~$draft.md',
      '.tmp/post.md',
      '.tmp\\post.md',
      'deep/.tmp/post.json',
      'README.md',
      'readme.json',
      'media/tip.png',
      'notes.txt',
    ])
      expect(isIgnoredPath(path), path).toBe(true);
  });
});

describe('inbox parsing', () => {
  const front = '---\nhandpost: 1\nid: a\nplatforms: [x]\n---\n';
  it('strips a UTF-8 BOM and normalizes CRLF line endings', () => {
    const file = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      bytes(`${front}Line one\nLine two\n`.replace(/\n/g, '\r\n')),
    ]);
    const result = parse('a.md', file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('Line one\nLine two');
  });
  it('keeps the body verbatim except one trailing newline', () => {
    const result = parse('a.md', `${front}First\n\n\nLast\n\n`);
    expect(result.ok && result.value.text).toBe('First\n\n\nLast\n');
  });
  it('rejects a Markdown file without front matter as parse_error', () => {
    const result = parse('a.md', 'Just some text\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe('parse_error');
  });
  it('rejects unclosed front matter and a text field in front matter', () => {
    expect(parse('a.md', '---\nhandpost: 1\nid: a\n').ok).toBe(false);
    const withText = parse('a.md', '---\nhandpost: 1\ntext: hi\n---\nbody\n');
    expect(!withText.ok && withText.issue.code).toBe('parse_error');
  });
  it('rejects a YAML alias bomb as parse_error', () => {
    const lines = ['a: &a ["x","x","x","x","x","x","x","x","x"]'];
    for (let level = 1; level < 9; level++) {
      const prev = String.fromCharCode(96 + level);
      const next = String.fromCharCode(97 + level);
      lines.push(
        `${next}: &${next} [*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev}]`,
      );
    }
    const result = parse('bomb.md', `---\n${lines.join('\n')}\n---\nbody\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe('parse_error');
  });
  it('rejects custom YAML tags and merge keys as parse_error', () => {
    for (const yaml of [
      'handpost: !!js/function "x"',
      'handpost: !custom 1',
      'base: &b {a: 1}\nx:\n  <<: *b',
    ])
      expect(parse('tag.md', `---\n${yaml}\n---\nbody\n`).ok, yaml).toBe(false);
  });
  it('rejects files over 256 KB as too_large', () => {
    const result = parse('big.json', Buffer.alloc(256 * 1024 + 1, 0x20));
    expect(!result.ok && result.issue.code).toBe('too_large');
  });
  it('rejects invalid JSON, non-object JSON and invalid UTF-8', () => {
    expect(parse('a.json', '{ nope').ok).toBe(false);
    expect(parse('a.json', '[1,2]').ok).toBe(false);
    expect(parse('a.json', Buffer.from([0x7b, 0xff, 0xfe, 0x7d])).ok).toBe(false);
  });
  it('accepts an unquoted YAML timestamp for when, and converts parser Date objects to ISO', () => {
    const result = parse(
      't.md',
      '---\nhandpost: 1\nid: t\nplatforms: [x]\nwhen: 2026-11-20T09:30:00+06:00\n---\nhi\n',
    );
    expect(result.ok && result.value.when).toBe('2026-11-20T09:30:00+06:00');
    expect(datesToIso({ when: new Date('2026-11-20T03:30:00Z'), nested: [new Date(0)] })).toEqual({
      when: '2026-11-20T03:30:00.000Z',
      nested: ['1970-01-01T00:00:00.000Z'],
    });
  });
});

describe('inbox schema', () => {
  const { topPost, batch, cancel, post } = defaultInboxSchemas;
  it('accepts minimal Markdown-derived, JSON, batch and cancel files', () => {
    const md = parse('m.md', '---\nhandpost: 1\nid: m\nplatforms: [x]\n---\nhi\n');
    expect(md.ok && topPost.safeParse(md.value).success).toBe(true);
    expect(topPost.safeParse({ handpost: 1, id: 'j', platforms: ['bluesky'], text: 'hi' }).success).toBe(
      true,
    );
    expect(batch.safeParse({ handpost: 1, posts: [{ id: 'b1', platforms: ['x'], text: 'a' }] }).success).toBe(
      true,
    );
    expect(cancel.safeParse({ handpost: 1, id: 'c', action: 'cancel' }).success).toBe(true);
  });
  it('reports an unknown field and a platform typo with JSON pointers', () => {
    const result = topPost.safeParse({ handpost: 1, id: 'a', platform: ['x'], text: 'hi' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = zodIssues(result.error);
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['', '/platforms']));
    expect(issues.find((issue) => issue.path === '')?.message).toContain('platform');
    const typo = topPost.safeParse({ handpost: 1, id: 'a', platforms: ['twitter'], text: 'hi' });
    expect(!typo.success && zodIssues(typo.error)[0]?.path).toBe('/platforms/0');
  });
  it('rejects a bad id and handpost: 2 with pointers', () => {
    const badId = topPost.safeParse({ handpost: 1, id: 'Bad ID', platforms: ['x'], text: 'hi' });
    expect(!badId.success && zodIssues(badId.error)[0]?.path).toBe('/id');
    const v2 = topPost.safeParse({ handpost: 2, id: 'a', platforms: ['x'], text: 'hi' });
    expect(!v2.success && zodIssues(v2.error)[0]?.path).toBe('/handpost');
  });
  it('enforces cross-field rules for overrides', () => {
    const value = post.parse({
      id: 'o',
      platforms: ['linkedin'],
      text: 'hi',
      overrides: { x: { text: 'x' }, linkedin: { thread: ['nope'], options: { page_name: 'P' } } },
    }) as InboxPost;
    expect(crossFieldIssues(value).map((issue) => issue.path)).toEqual([
      '/overrides/x',
      '/overrides/linkedin/thread',
      '/overrides/linkedin/options/page_name',
    ]);
  });
});

describe('protocol examples', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(
    JSON.parse(readFileSync(join(process.cwd(), 'schema', 'handpost-post.v1.schema.json'), 'utf8')),
  );
  it('validate against the published JSON Schema and the zod schema', () => {
    const files = readdirSync(fixtures);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const parsed = parse(file, readFileSync(join(fixtures, file)));
      expect(parsed.ok, file).toBe(true);
      if (!parsed.ok) continue;
      expect(validate(parsed.value), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
      const { topPost, batch, cancel } = defaultInboxSchemas;
      const zod = 'posts' in parsed.value ? batch : parsed.value.action === 'cancel' ? cancel : topPost;
      expect(zod.safeParse(parsed.value).success, file).toBe(true);
    }
  });
  it('validates the receipt and status examples against their schemas', () => {
    const load = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'));
    const receipt = ajv.compile(load('schema/handpost-receipt.v1.schema.json'));
    const status = ajv.compile(load('schema/handpost-status.v1.schema.json'));
    expect(
      receipt(load('examples/receipts/weekly-tips-20261120-folder-scheduling.json')),
      JSON.stringify(receipt.errors),
    ).toBe(true);
    expect(status(load('examples/handpost.status.json')), JSON.stringify(status.errors)).toBe(true);
  });
});
