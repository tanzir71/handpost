import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createHandpostMcp, serve, TOOLS } from '../../src/mcp/server';
import { parseInboxFile } from '../../src/main/inbox/parse';
import { defaultInboxSchemas } from '../../src/shared/inbox-schema';

let folder: string;
afterEach(() => rmSync(folder, { recursive: true, force: true }));
function setup() {
  folder = mkdtempSync(join(tmpdir(), 'handpost-mcp-'));
  for (const dir of ['inbox', 'receipts', 'rejected']) mkdirSync(join(folder, dir), { recursive: true });
  return createHandpostMcp(folder);
}
const call = async (server: ReturnType<typeof setup>, name: string, args: Record<string, unknown> = {}) => {
  const response = (await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  })) as {
    result: { content: Array<{ text: string }>; isError?: boolean };
  };
  return { text: response.result.content[0]!.text, isError: Boolean(response.result.isError) };
};

describe('handpost-mcp protocol', () => {
  it('answers initialize, ping and tools/list, and ignores notifications', async () => {
    const server = setup();
    const init = (await server.handle({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    })) as {
      result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string } };
    };
    expect(init.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'handpost-mcp' },
    });
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await server.handle({ jsonrpc: '2.0', id: 2, method: 'ping' })).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {},
    });
    const list = (await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })) as {
      result: { tools: typeof TOOLS };
    };
    expect(list.result.tools.map((tool) => tool.name)).toEqual([
      'handpost_status',
      'handpost_write_post',
      'handpost_cancel',
      'handpost_receipt',
      'handpost_list_receipts',
    ]);
    expect(await server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).toMatchObject({
      error: { code: -32601 },
    });
  });
});

describe('handpost-mcp tools only write inbox files and read results', () => {
  it('writes a valid post atomically as an inbox file the app accepts', async () => {
    const server = setup();
    const result = await call(server, 'handpost_write_post', {
      id: 'mcp-weekly-20261120',
      platforms: ['x', 'linkedin'],
      text: 'Written through MCP',
      source: 'claude:mcp-test',
      overrides: { x: { thread: ['Second part'] } },
    });
    expect(result.isError).toBe(false);
    expect(readdirSync(join(folder, 'inbox')).filter((name) => !name.startsWith('.'))).toEqual([
      'mcp-weekly-20261120.json',
    ]);
    expect(readdirSync(join(folder, 'inbox', '.tmp'))).toEqual([]);
    const parsed = parseInboxFile(
      'mcp-weekly-20261120.json',
      readFileSync(join(folder, 'inbox', 'mcp-weekly-20261120.json')),
    );
    expect(parsed.ok && defaultInboxSchemas.topPost.safeParse(parsed.value).success).toBe(true);
    // Writing it again while the first file is still waiting would only make a duplicate: refused.
    expect(
      (
        await call(server, 'handpost_write_post', {
          id: 'mcp-weekly-20261120',
          platforms: ['x'],
          text: 'again',
        })
      ).isError,
    ).toBe(true);
  });
  it('refuses invalid posts before writing anything', async () => {
    const server = setup();
    const typo = await call(server, 'handpost_write_post', { id: 'bad', platform: ['x'], text: 'typo' });
    expect(typo.isError).toBe(true);
    expect(JSON.parse(typo.text).errors[0]).toMatchObject({ code: 'schema_invalid' });
    const outside = await call(server, 'handpost_write_post', {
      id: 'escape',
      platforms: ['x'],
      text: 'x',
      media: [{ path: '../../secret.png' }],
    });
    expect(JSON.parse(outside.text).errors[0].code).toBe('media_outside_root');
    const missing = await call(server, 'handpost_write_post', {
      id: 'pic',
      platforms: ['x'],
      text: 'x',
      media: [{ path: 'media/later.png' }],
    });
    expect(JSON.parse(missing.text).errors[0].code).toBe('media_missing');
    const cross = await call(server, 'handpost_write_post', {
      id: 'cross',
      platforms: ['linkedin'],
      text: 'x',
      overrides: { x: { text: 'y' } },
    });
    expect(cross.isError).toBe(true);
    expect(readdirSync(join(folder, 'inbox')).filter((name) => !name.startsWith('.'))).toEqual([]);
  });
  it('writes cancel files and reads receipts, waiting files and the status liveness', async () => {
    const server = setup();
    await call(server, 'handpost_cancel', { id: 'weekly-1' });
    expect(JSON.parse(readFileSync(join(folder, 'inbox', 'cancel-weekly-1.json'), 'utf8'))).toEqual({
      handpost: 1,
      id: 'weekly-1',
      action: 'cancel',
    });
    expect((await call(server, 'handpost_receipt', { id: 'weekly-1' })).text).toContain('still in inbox/');
    expect((await call(server, 'handpost_receipt', { id: '../../etc/passwd' })).isError).toBe(true);
    writeFileSync(
      join(folder, 'receipts', 'done-1.json'),
      JSON.stringify({ handpost: 1, id: 'done-1', state: 'published', updated_at: '2026-11-18T03:00:00Z' }),
    );
    expect(JSON.parse((await call(server, 'handpost_receipt', { id: 'done-1' })).text).state).toBe(
      'published',
    );
    expect(JSON.parse((await call(server, 'handpost_list_receipts')).text)).toEqual([
      { id: 'done-1', state: 'published', updated_at: '2026-11-18T03:00:00Z' },
    ]);
    writeFileSync(
      join(folder, 'handpost.status.json'),
      JSON.stringify({ handpost: 1, alive_until: '2020-01-01T00:00:00Z' }),
    );
    expect(JSON.parse((await call(server, 'handpost_status')).text)).toMatchObject({ running: false });
  });
  it('reports a missing Handpost folder instead of creating one', async () => {
    folder = mkdtempSync(join(tmpdir(), 'handpost-mcp-'));
    const server = createHandpostMcp(join(folder, 'nope'));
    expect(
      (await call(server, 'handpost_write_post', { id: 'a', platforms: ['x'], text: 'x' })).isError,
    ).toBe(true);
    expect(existsSync(join(folder, 'nope'))).toBe(false);
  });
});

describe('handpost-mcp stdio transport', () => {
  it('reads newline-delimited JSON-RPC and answers each request on its own line', async () => {
    setup();
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(String(chunk)));
    const done = serve(folder, input, output);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    input.write('not json\n');
    input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    await done;
    const lines = chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines.map((line) => line.id)).toEqual(expect.arrayContaining([1, null, 2]));
    expect(lines.find((line) => line.id === null).error.code).toBe(-32700);
    expect(lines).toHaveLength(3);
  });
});
