import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { GitSource, sourceName, validGitUrl } from '../../../src/main/inbox/git-source';
import { createHarness, md, removeTree, type Harness } from './helpers';

const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  });

describe('remote source URLs', () => {
  it('accepts https, ssh, scp-style and file URLs and refuses option-like or spaced values', () => {
    for (const url of [
      'https://github.com/me/posts.git',
      'ssh://git@github.com/me/posts.git',
      'git@github.com:me/posts.git',
      'file:///C:/repos/posts.git',
    ])
      expect(validGitUrl(url), url).toBe(true);
    for (const url of [
      '',
      '--upload-pack=evil',
      'http://insecure.example/x.git',
      'C:\\repos\\posts',
      'https://a b',
    ])
      expect(validGitUrl(url), url).toBe(false);
  });
  it('names the clone after the repository', () => {
    expect(sourceName('git@github.com:me/Weekly Posts.git')).toBe('weekly-posts');
    expect(sourceName('https://github.com/me/handpost-inbox.git/')).toBe('handpost-inbox');
    expect(sourceName('file:///C:/repos/remote.git')).toBe('remote');
  });
});

// Each test spawns git a dozen times; on Windows that alone can take several seconds.
describe.runIf(hasGit)('remote Git source', { timeout: 60_000 }, () => {
  let h: Harness;
  let base: string;
  afterEach(async () => {
    await h?.cleanup();
    removeTree(base);
  });

  function setup() {
    base = mkdtempSync(join(tmpdir(), 'handpost-git-'));
    const remote = join(base, 'remote.git');
    const work = join(base, 'work');
    execFileSync('git', ['init', '--quiet', '--bare', remote]);
    execFileSync('git', ['clone', '--quiet', remote, work]);
    const source = new GitSource(() => h.root);
    h = createHarness({ extraRoots: () => source.roots() });
    source.configure({ enabled: true, url: pathToFileURL(remote).href, pushReceipts: true });
    const publish = (name: string, content: string) => {
      mkdirSync(join(work, 'inbox'), { recursive: true });
      writeFileSync(join(work, 'inbox', name), content);
      git(work, 'add', '.');
      git(work, 'commit', '--quiet', '-m', `add ${name}`);
      git(work, 'push', '--quiet', 'origin', 'HEAD');
    };
    return { source, work, publish };
  }

  it('clones, reads inbox/ without moving files, and never reprocesses a handled file', async () => {
    const { source, publish } = setup();
    publish('cloud.md', md('id: cloud-post\nplatforms: [bluesky]', 'Written by a cloud task'));
    expect(await source.sync()).toBe(true);
    const clone = join(h.root, '.sources', 'remote');
    expect(existsSync(join(clone, 'inbox', 'cloud.md'))).toBe(true);
    await h.run();
    const receipt = h.receipt('cloud-post');
    expect(receipt).toMatchObject({
      state: 'scheduled',
      source: 'git:remote',
      file: '.sources/remote/inbox/cloud.md',
    });
    expect(existsSync(join(clone, 'inbox', 'cloud.md'))).toBe(true);
    expect(h.count('SELECT count(*) FROM inbox_files')).toBe(1);
    await h.run();
    expect(h.count('SELECT count(*) FROM inbox_files')).toBe(1);
    expect(h.count('SELECT count(*) FROM posts')).toBe(1);
    expect(source.health()).toMatchObject({ enabled: true, name: 'remote', lastError: null, state: 'ok' });
  });

  it('picks up new commits on the next pull and pushes receipts back when opted in', async () => {
    const { source, work, publish } = setup();
    publish('one.md', md('id: cloud-one\nplatforms: [x]'));
    await source.sync();
    await h.run();
    publish(
      'two.json',
      JSON.stringify({ handpost: 1, id: 'cloud-two', platforms: ['bluesky'], text: 'Second' }),
    );
    await source.sync();
    await h.run();
    expect(h.receipt('cloud-two').state).toBe('scheduled');
    expect(await source.pushReceipts(h.service.idsForRoot('git:remote'))).toBe(2);
    git(work, 'pull', '--quiet');
    const pushed = JSON.parse(readFileSync(join(work, 'receipts', 'cloud-one.json'), 'utf8'));
    expect(pushed).toMatchObject({ id: 'cloud-one', state: 'scheduled' });
    // Nothing new to push: no empty commit.
    expect(await source.pushReceipts(h.service.idsForRoot('git:remote'))).toBe(0);
  });

  it('reports an unreachable repository without throwing and keeps the local inbox working', async () => {
    base = mkdtempSync(join(tmpdir(), 'handpost-git-'));
    const source = new GitSource(() => h.root);
    h = createHarness({ extraRoots: () => source.roots() });
    source.configure({
      enabled: true,
      url: pathToFileURL(join(base, 'missing.git')).href,
      pushReceipts: false,
    });
    expect(await source.sync()).toBe(false);
    expect(source.health()).toMatchObject({ state: 'danger', lastError: expect.stringContaining('Git:') });
    expect(source.roots()).toEqual([]);
    h.drop('local.md', md('id: local-still-works\nplatforms: [x]'));
    await h.run();
    expect(h.receipt('local-still-works').state).toBe('scheduled');
  });

  it('does nothing while switched off', async () => {
    base = mkdtempSync(join(tmpdir(), 'handpost-git-'));
    const source = new GitSource(() => h.root);
    h = createHarness();
    source.configure({ enabled: false, url: 'https://github.com/me/posts.git', pushReceipts: true });
    expect(await source.sync()).toBe(false);
    expect(source.health().state).toBe('off');
    expect(existsSync(join(h.root, '.sources'))).toBe(false);
  });
});
