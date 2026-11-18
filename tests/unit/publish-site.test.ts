import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitAndPush, stageSite } from '../../scripts/publish-site';

const root = resolve(__dirname, '../..');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const temps: string[] = [];
const temp = async (prefix: string) => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5 })));
});

describe('website:publish staging', () => {
  it.each([
    ['forward slashes', root.replace(/\\/g, '/')],
    ['backslashes', root.replace(/\//g, '\\')],
  ])('stages the tracked site, the schemas and .nojekyll (%s)', async (_label, input) => {
    const dest = await temp('handpost-stage-');
    const files = await stageSite(input, dest);
    expect(files).toContain('index.html');
    expect(files).toContain('demo/index.html');
    expect(files).toContain('.nojekyll');
    for (const schema of ['handpost-post.v1', 'handpost-receipt.v1', 'handpost-status.v1'])
      expect(files).toContain(`schema/${schema}.schema.json`);
    expect(files.some((file) => file.startsWith('site/'))).toBe(false);
    const tracked = git(root, 'ls-files', '--', 'site')
      .split('\n')
      .map((file) => file.replace(/^site\//, ''));
    for (const file of files)
      if (!file.startsWith('schema/') && file !== '.nojekyll') expect(tracked).toContain(file);
    expect(await readFile(join(dest, 'schema/handpost-post.v1.schema.json'), 'utf8')).toBe(
      await readFile(join(root, 'schema/handpost-post.v1.schema.json'), 'utf8'),
    );
  });
});

describe('website:publish push', () => {
  const identity = { name: 'Handpost test', email: 'test@example.invalid' };
  const stage = async (files: Record<string, string>) => {
    const dir = await temp('handpost-staged-');
    for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
    return dir;
  };

  it('creates gh-pages, skips identical publishes and fast-forwards with history', async () => {
    const remote = await temp('handpost-remote-');
    git(remote, 'init', '-q', '--bare');

    const first = commitAndPush(
      await stage({ 'index.html': 'one', 'old.txt': 'x' }),
      remote,
      'site: one',
      identity,
    );
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(git(remote, 'rev-parse', 'gh-pages')).toBe(first);

    expect(
      commitAndPush(await stage({ 'index.html': 'one', 'old.txt': 'x' }), remote, 'site: same', identity),
    ).toBe(null);

    const second = commitAndPush(await stage({ 'index.html': 'two' }), remote, 'site: two', identity);
    expect(git(remote, 'rev-parse', 'gh-pages')).toBe(second);
    expect(git(remote, 'rev-parse', `${second}^`)).toBe(first);
    expect(git(remote, 'ls-tree', '--name-only', 'gh-pages').split('\n')).toEqual(['index.html']);
    expect(git(remote, 'show', 'gh-pages:index.html')).toBe('two');
    expect(existsSync(join(remote, 'refs', 'heads', 'master'))).toBe(false);
  });
});
