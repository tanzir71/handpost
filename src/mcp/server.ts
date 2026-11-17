/**
 * handpost-mcp — a local MCP server (stdio) for writers that speak MCP instead of writing files themselves.
 *
 * Design rule (DECISIONS D2): it only does what any writer could do with files. It writes post/cancel files into
 * `<Handpost folder>/inbox/` atomically, and reads `receipts/`, `rejected/` and `handpost.status.json`. It never
 * talks to the app, the database, a browser or the network, so every guardrail of the inbox still applies.
 *
 *   node dist/mcp/server.cjs [--folder ~/Handpost]      (or: npm run mcp -- --folder …)
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import {
  crossFieldIssues,
  defaultInboxSchemas,
  ID_PATTERN,
  INBOX_PLATFORMS,
  zodIssues,
  type InboxPost,
} from '../shared/inbox-schema';

export const SERVER_INFO = { name: 'handpost-mcp', version: '0.2.0' };
const PROTOCOL_VERSION = '2025-06-18';

type Json = Record<string, unknown>;
interface Request {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Json;
}
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const text = (value: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const POST_INPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'platforms', 'text'],
  properties: {
    id: {
      type: 'string',
      pattern: ID_PATTERN.source,
      description: 'Deterministic id, e.g. weekly-tips-20261120-slug',
    },
    platforms: { type: 'array', items: { enum: [...INBOX_PLATFORMS] }, minItems: 1, uniqueItems: true },
    text: { type: 'string', description: 'Base text for every platform without an override' },
    when: { type: 'string', description: 'next-slot (default), now, or ISO 8601 with offset' },
    mode: { enum: ['schedule', 'review', 'draft'] },
    media: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: { path: { type: 'string' }, alt: { type: 'string' } },
      },
      description: 'Paths relative to inbox/ of files already saved there',
    },
    overrides: { type: 'object', description: 'Per-platform { text, thread, first_comment, options }' },
    labels: { type: 'array', items: { type: 'string' } },
    source: { type: 'string', description: '<tool>:<task>, e.g. claude:weekly-tips' },
    on_conflict: { enum: ['skip', 'replace'] },
  },
};

export const TOOLS = [
  {
    name: 'handpost_status',
    description:
      'Read handpost.status.json: connected platforms, limits, next free slots, upcoming and recent posts, and whether Handpost is running.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'handpost_write_post',
    description:
      'Validate a post against the Handpost inbox protocol v1 and drop it into inbox/ atomically. Handpost then schedules it (or holds it for review) and writes receipts/<id>.json.',
    inputSchema: POST_INPUT,
  },
  {
    name: 'handpost_cancel',
    description:
      'Ask Handpost to cancel the unpublished platforms of a post id (writes a cancel file into inbox/).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', pattern: ID_PATTERN.source } },
    },
  },
  {
    name: 'handpost_receipt',
    description:
      'Read receipts/<id>.json: state, per-platform status, scheduled time, URL once published, warnings and errors.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', pattern: ID_PATTERN.source } },
    },
  },
  {
    name: 'handpost_list_receipts',
    description: 'List the most recently updated receipts (id and state).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
    },
  },
];

async function atomicJson(dir: string, name: string, value: unknown): Promise<string> {
  const staging = join(dir, '.tmp');
  await mkdir(staging, { recursive: true });
  const temp = join(staging, `${name}.${randomBytes(4).toString('hex')}.tmp`);
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const target = join(dir, name);
  await rename(temp, target);
  return target;
}

export function createHandpostMcp(folder: string) {
  const inbox = join(folder, 'inbox');

  async function readJson(path: string): Promise<Json | null> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Json;
    } catch {
      return null;
    }
  }

  async function callTool(name: string, args: Json): Promise<ToolResult> {
    if (!existsSync(folder))
      return text(
        `The Handpost folder ${folder} does not exist. Is Handpost installed and has it run once?`,
        true,
      );
    switch (name) {
      case 'handpost_status': {
        const status = await readJson(join(folder, 'handpost.status.json'));
        if (!status)
          return text(
            'No handpost.status.json yet. Write posts anyway with when: next-slot; Handpost reads the inbox on its next start.',
          );
        const alive = typeof status.alive_until === 'string' && Date.parse(status.alive_until) > Date.now();
        return text({
          running: alive,
          ...(alive ? {} : { note: 'alive_until is in the past: Handpost appears not to be running' }),
          status,
        });
      }
      case 'handpost_write_post': {
        const post = { handpost: 1, ...args };
        const parsed = defaultInboxSchemas.topPost.safeParse(post);
        if (!parsed.success) return text({ rejected: true, errors: zodIssues(parsed.error) }, true);
        const cross = crossFieldIssues(parsed.data as InboxPost);
        if (cross.length) return text({ rejected: true, errors: cross }, true);
        for (const item of (parsed.data as InboxPost).media ?? []) {
          const path = resolve(inbox, item.path.replace(/\\/g, '/'));
          const rel = relative(resolve(inbox), path);
          if (rel.startsWith('..') || isAbsolute(rel))
            return text(
              {
                rejected: true,
                errors: [{ code: 'media_outside_root', message: `${item.path} is outside inbox/` }],
              },
              true,
            );
          if (!existsSync(path))
            return text(
              {
                rejected: true,
                errors: [
                  {
                    code: 'media_missing',
                    message: `${item.path} is not in inbox/ yet — save the file there first`,
                  },
                ],
              },
              true,
            );
        }
        const id = parsed.data.id;
        const name = `${id}.json`;
        if (existsSync(join(inbox, name)))
          return text(
            `inbox/${name} is still waiting to be processed. Check receipts/${id}.json in a minute instead of writing it again.`,
            true,
          );
        await mkdir(inbox, { recursive: true });
        await atomicJson(inbox, name, parsed.data);
        return text({
          written: `inbox/${name}`,
          id,
          next: `Handpost processes it within about a minute; read the result with handpost_receipt { "id": "${id}" }.`,
        });
      }
      case 'handpost_cancel': {
        const id = String(args.id ?? '');
        if (!ID_PATTERN.test(id)) return text('id must match ^[a-z0-9][a-z0-9._-]{0,79}$', true);
        await mkdir(inbox, { recursive: true });
        await atomicJson(inbox, `cancel-${id}.json`, { handpost: 1, id, action: 'cancel' });
        return text({ written: `inbox/cancel-${id}.json`, id });
      }
      case 'handpost_receipt': {
        const id = String(args.id ?? '');
        if (!ID_PATTERN.test(id)) return text('id must match ^[a-z0-9][a-z0-9._-]{0,79}$', true);
        const receipt = await readJson(join(folder, 'receipts', `${id}.json`));
        if (receipt) return text(receipt);
        const waiting =
          existsSync(inbox) &&
          (await readdir(inbox)).some((file) =>
            [`${id}.json`, `${id}.md`, `${id}.markdown`, `cancel-${id}.json`].includes(file),
          );
        return text(
          waiting ? `${id} is still in inbox/ waiting to be processed.` : `No receipt for ${id}.`,
          !waiting,
        );
      }
      case 'handpost_list_receipts': {
        const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20) || 20));
        const dir = join(folder, 'receipts');
        if (!existsSync(dir)) return text([]);
        const files = (await readdir(dir)).filter((file) => file.endsWith('.json') && !file.startsWith('.'));
        const dated = await Promise.all(
          files.map(async (file) => ({ file, mtime: (await stat(join(dir, file))).mtimeMs })),
        );
        const rows = [];
        for (const { file } of dated.sort((a, b) => b.mtime - a.mtime).slice(0, limit)) {
          const receipt = await readJson(join(dir, file));
          rows.push({
            id: file.slice(0, -5),
            state: receipt?.state ?? 'unreadable',
            updated_at: receipt?.updated_at ?? null,
          });
        }
        return text(rows);
      }
      default:
        return text(`Unknown tool ${name}`, true);
    }
  }

  /** Handles one JSON-RPC message; returns the response, or null for notifications. */
  async function handle(message: Request): Promise<Json | null> {
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: message.id ?? null, result });
    const fail = (code: number, text: string) => ({
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: { code, message: text },
    });
    if (message.id === undefined) return null; // notifications (e.g. notifications/initialized)
    try {
      switch (message.method) {
        case 'initialize':
          return reply({
            protocolVersion:
              typeof message.params?.protocolVersion === 'string'
                ? message.params.protocolVersion
                : PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
            instructions:
              'Handpost publishes posts written to its inbox folder through the owner’s own browser, at human pace. Read handpost_status first, write one post per call with a deterministic id, then check handpost_receipt.',
          });
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({ tools: TOOLS });
        case 'tools/call': {
          const name = String(message.params?.name ?? '');
          const args = (message.params?.arguments ?? {}) as Json;
          return reply(await callTool(name, args));
        }
        default:
          return fail(-32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      return fail(-32603, error instanceof Error ? error.message : String(error));
    }
  }

  return { folder, handle, callTool };
}

/** Newline-delimited JSON-RPC over stdio (the MCP stdio transport). */
export function serve(
  folder: string,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const server = createHandpostMcp(folder);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending: Array<Promise<void>> = [];
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message: Request;
    try {
      message = JSON.parse(line) as Request;
    } catch {
      output.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`,
      );
      return;
    }
    pending.push(
      server.handle(message).then((response) => {
        if (response) output.write(`${JSON.stringify(response)}\n`);
      }),
    );
  });
  return new Promise((resolveDone) =>
    lines.on('close', () => {
      void Promise.all(pending).then(() => resolveDone());
    }),
  );
}

function folderFromArgs(argv: string[]): string {
  const index = argv.indexOf('--folder');
  const raw =
    (index >= 0 ? argv[index + 1] : undefined) ?? process.env.HANDPOST_FOLDER ?? join(homedir(), 'Handpost');
  return resolve(raw.replace(/^~(?=$|[\\/])/, homedir()));
}

if (process.argv[1] && /server\.(c?js|ts)$/.test(process.argv[1]))
  void serve(folderFromArgs(process.argv.slice(2)));
