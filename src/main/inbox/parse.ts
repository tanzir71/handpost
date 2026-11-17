/**
 * Turns the raw bytes of an inbox file into a plain object (INBOX_PROTOCOL §3–4). No validation beyond
 * "is this a well-formed Markdown-with-front-matter or JSON object" — the schema step does the rest.
 */
import { extname } from 'node:path';
import { parseDocument } from 'yaml';
import { MAX_FILE_BYTES, type InboxIssue } from '../../shared/inbox-schema';

export type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; issue: InboxIssue };

const fail = (code: 'parse_error' | 'too_large', message: string): ParseResult => ({
  ok: false,
  issue: { code, message },
});

/** UTF-8 decode (strict), strip one leading BOM, normalize CRLF/CR to LF. */
export function decodeText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** Replaces Date values (YAML 1.1-style timestamps some parsers produce) with ISO 8601 strings. */
export function datesToIso(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (Array.isArray(value)) return value.map(datesToIso);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, datesToIso(item)]));
  return value;
}

function hasMergeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMergeKey);
  if (value && typeof value === 'object')
    return Object.entries(value).some(([key, item]) => key === '<<' || hasMergeKey(item));
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** YAML 1.2 core schema only: no custom tags, no merge keys, ≤ 50 aliases, unique keys. */
export function parseFrontMatter(source: string): ParseResult {
  let doc;
  try {
    doc = parseDocument(source, {
      schema: 'core',
      customTags: [],
      merge: false,
      uniqueKeys: true,
      prettyErrors: false,
      strict: true,
    });
  } catch (error) {
    return fail('parse_error', `Front matter is not valid YAML: ${(error as Error).message}`);
  }
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem) return fail('parse_error', `Front matter is not valid YAML: ${problem.message}`);
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch (error) {
    return fail('parse_error', `Front matter is not valid YAML: ${(error as Error).message}`);
  }
  value = datesToIso(value);
  if (!isPlainObject(value)) return fail('parse_error', 'Front matter must be a YAML mapping');
  if (hasMergeKey(value)) return fail('parse_error', 'YAML merge keys (<<) are not supported');
  return { ok: true, value };
}

/**
 * Markdown: `---` line, YAML, `---` line, body. The body becomes `text` with one trailing newline trimmed.
 * A front matter `text` field is refused because the body is the text.
 */
export function parseMarkdown(text: string): ParseResult {
  if (!text.startsWith('---\n'))
    return fail('parse_error', 'Missing front matter: the file must start with a line containing only ---');
  const end = text.indexOf('\n---', 3);
  let close = end;
  // The closing fence must be a whole line (`---` followed by newline or end of file).
  while (close !== -1) {
    const after = text.slice(close + 4, close + 5);
    if (after === '' || after === '\n') break;
    close = text.indexOf('\n---', close + 4);
  }
  if (close === -1) return fail('parse_error', 'Front matter is not closed with a line containing only ---');
  const front = parseFrontMatter(text.slice(4, close + 1));
  if (!front.ok) return front;
  if ('text' in front.value)
    return fail('parse_error', 'Markdown files take the post text from the body, not a text field');
  let body = text.slice(close + 4);
  if (body.startsWith('\n')) body = body.slice(1);
  if (body.endsWith('\n')) body = body.slice(0, -1);
  return { ok: true, value: { ...front.value, text: body } };
}

export function parseJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return fail('parse_error', `Not valid JSON: ${(error as Error).message}`);
  }
  if (!isPlainObject(value)) return fail('parse_error', 'The JSON file must contain an object');
  return { ok: true, value };
}

export type InboxFormat = 'markdown' | 'json';
export function formatOf(fileName: string): InboxFormat | null {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.json') return 'json';
  return null;
}

/** Full parse of one inbox file's bytes. */
export function parseInboxFile(fileName: string, bytes: Uint8Array): ParseResult {
  if (bytes.byteLength > MAX_FILE_BYTES)
    return fail('too_large', `File is ${Math.ceil(bytes.byteLength / 1024)} KB; the limit is 256 KB`);
  const format = formatOf(fileName);
  if (!format) return fail('parse_error', 'Only .md, .markdown and .json files are read');
  const text = decodeText(bytes);
  if (text === null) return fail('parse_error', 'File is not valid UTF-8');
  return format === 'markdown' ? parseMarkdown(text) : parseJson(text);
}
