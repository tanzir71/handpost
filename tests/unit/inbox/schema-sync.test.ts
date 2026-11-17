import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { buildPostJsonSchema, serializeSchema } from '../../../scripts/schema';
import { parseInboxFile } from '../../../src/main/inbox/parse';
import { crossFieldIssues, defaultInboxSchemas, type InboxPost } from '../../../src/shared/inbox-schema';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(JSON.parse(read('schema/handpost-post.v1.schema.json')));

describe('published post schema', () => {
  it('equals what the zod schema generates (run npm run schema after changing it)', () => {
    expect(read('schema/handpost-post.v1.schema.json')).toBe(serializeSchema(buildPostJsonSchema()));
  });
  it('agrees with the zod schema on valid and invalid files', () => {
    const cases: Array<[unknown, boolean]> = [
      [{ handpost: 1, id: 'a', platforms: ['x'], text: 'hi' }, true],
      [{ handpost: 1, id: 'a', platforms: ['x'], text: 'hi', when: '2026-11-20T09:30' }, true],
      [{ handpost: 1, posts: [{ id: 'b', platforms: ['bluesky'], text: 'hi' }] }, true],
      [{ handpost: 1, id: 'c', action: 'cancel' }, true],
      [{ id: 'a', platforms: ['x'], text: 'hi' }, false],
      [{ handpost: 2, id: 'a', platforms: ['x'], text: 'hi' }, false],
      [{ handpost: 1, id: 'a', platform: ['x'], text: 'hi' }, false],
      [{ handpost: 1, id: 'a', platforms: ['twitter'], text: 'hi' }, false],
      [{ handpost: 1, id: 'a', platforms: ['x', 'x'], text: 'hi' }, false],
      [{ handpost: 1, id: 'Bad Id', platforms: ['x'], text: 'hi' }, false],
      [{ handpost: 1, id: 'a', platforms: ['x'], text: 'hi', when: 'tomorrow' }, false],
      [
        {
          handpost: 1,
          id: 'a',
          platforms: ['x'],
          text: 'hi',
          overrides: { x: { options: { colour: 'red' } } },
        },
        false,
      ],
      [{ handpost: 1, id: 'c', action: 'cancel', text: 'extra' }, false],
    ];
    for (const [value, valid] of cases) {
      expect(validate(value), JSON.stringify(value)).toBe(valid);
      expect(defaultInboxSchemas.file.safeParse(value).success, JSON.stringify(value)).toBe(valid);
    }
  });
});

/** Fenced code blocks of a Markdown document: [info string, body]. */
function fencedBlocks(markdown: string): Array<[string, string]> {
  return [...markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)].map((match) => [
    match[1]!.trim(),
    match[2]!,
  ]);
}

/** The post file a block contains: the block itself, or the body of a heredoc inside a shell block. */
function fileIn(info: string, body: string): { name: string; text: string } | null {
  if (!/handpost['"]?\s*:\s*1/.test(body)) return null;
  if (/^(sh|bash|zsh)$/.test(info)) {
    const heredoc = /<<'EOF'\n([\s\S]*?)\nEOF/.exec(body);
    if (!heredoc || heredoc[1]!.includes('…')) return null; // "…file content…" placeholder, not a file
    return { name: 'post.md', text: `${heredoc[1]}\n` };
  }
  if (info === 'json') return { name: 'post.json', text: body };
  if (info === 'markdown' || info === 'md') return { name: 'post.md', text: body };
  return null;
}

describe('writer guides', () => {
  for (const guide of [
    'integrations/claude/handpost-inbox/SKILL.md',
    'integrations/codex/AGENTS.md',
    'docs/AUTOMATION.md',
  ]) {
    it(`${guide}: every complete post file in a code block validates`, () => {
      const files = fencedBlocks(read(guide))
        .map(([info, body]) => fileIn(info, body))
        .filter((file): file is { name: string; text: string } => file !== null);
      if (guide !== 'docs/AUTOMATION.md') expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const parsed = parseInboxFile(file.name, Buffer.from(file.text, 'utf8'));
        expect(parsed.ok, `${guide}: ${JSON.stringify(parsed)}`).toBe(true);
        if (!parsed.ok) continue;
        expect(validate(parsed.value), `${guide}: ${JSON.stringify(validate.errors)}`).toBe(true);
        const zod = defaultInboxSchemas.topPost.safeParse(parsed.value);
        expect(zod.success, guide).toBe(true);
        if (zod.success) expect(crossFieldIssues(zod.data as InboxPost)).toEqual([]);
      }
    });
  }
  it('the skill shipped into the Handpost folder is the repository skill', () => {
    // scripts/copy-assets.ts copies it verbatim; the app writes it as HANDPOST_WRITER.md on first run.
    expect(read('scripts/copy-assets.ts')).toContain("'integrations/claude/handpost-inbox/SKILL.md'");
  });
});
