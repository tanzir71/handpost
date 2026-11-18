/**
 * Publishes the landing page and demo to the `gh-pages` branch from this machine, so GitHub Pages ("Deploy from a
 * branch": gh-pages, /) serves them without any workflow in this repository (owner, 2026-11-19).
 *
 *   npm run website:publish              # verify, stage, commit and push gh-pages
 *   npm run website:publish -- --dry-run # verify and stage only; prints the staging folder
 *
 * Only committed files are published: the git-tracked contents of `site/`, the JSON Schemas from `schema/` (as the
 * Pages workflow copied them) and `.nojekyll`. It refuses to publish while `site/` or `schema/` has uncommitted
 * changes, keeps the branch's history (a normal fast-forward push, never a force push) and does nothing when the
 * staged site is identical to the published one.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BRANCH = 'gh-pages';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git') out.push(...(await listFiles(full, base)));
    } else out.push(relative(base, full).split('\\').join('/'));
  }
  return out.sort();
}

/** Copies what GitHub Pages should serve into `dest` and returns the staged paths (forward slashes). */
export async function stageSite(root: string, dest: string): Promise<string[]> {
  const repo = resolve(root.replace(/\\/g, '/'));
  const tracked = git(repo, ['ls-files', '-z', '--', 'site'])
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('site/schema/'));
  for (const file of tracked) {
    const target = join(dest, ...file.split('/').slice(1));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repo, ...file.split('/')), target);
  }
  await mkdir(join(dest, 'schema'), { recursive: true });
  for (const name of await readdir(join(repo, 'schema')))
    if (name.endsWith('.json')) await copyFile(join(repo, 'schema', name), join(dest, 'schema', name));
  await writeFile(join(dest, '.nojekyll'), '');
  return listFiles(dest);
}

/**
 * Turns the staged folder into the next commit of `remote`'s gh-pages branch and pushes it. The previous publish
 * becomes the parent (history is kept; the push is a fast-forward). Returns the new commit, or null when the staged
 * files are identical to the published ones.
 */
export function commitAndPush(
  staged: string,
  remote: string,
  message: string,
  identity: { name: string; email: string },
): string | null {
  const as = ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`];
  git(staged, ['init', '-q']);
  git(staged, ['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`]);
  git(staged, ['remote', 'add', 'origin', remote]);
  const exists = git(staged, ['ls-remote', '--heads', 'origin', BRANCH]) !== '';
  if (exists) {
    git(staged, ['fetch', '-q', '--depth', '1', 'origin', BRANCH]);
    git(staged, ['reset', '-q', 'FETCH_HEAD']);
  }
  git(staged, ['add', '-A']);
  if (exists && git(staged, ['diff', '--cached', '--name-only']) === '') return null;
  git(staged, [...as, 'commit', '-q', '-m', message]);
  git(staged, ['push', '-q', 'origin', BRANCH]);
  return git(staged, ['rev-parse', 'HEAD']);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && git(root, ['status', '--porcelain', '--', 'site', 'schema']))
    throw new Error('site/ or schema/ has uncommitted changes; commit them before publishing.');
  for (const script of ['scripts/site-schema.mjs', 'scripts/verify-website.mjs'])
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });

  const dest = await mkdtemp(join(tmpdir(), 'handpost-gh-pages-'));
  const files = await stageSite(root, dest);
  console.log(`Staged ${files.length} files in ${dest}`);
  if (dryRun) return;
  try {
    const source = git(root, ['rev-parse', '--short', 'HEAD']);
    const published = commitAndPush(
      dest,
      git(root, ['remote', 'get-url', 'origin']),
      `site: publish master ${source}`,
      {
        name: git(root, ['config', 'user.name']),
        email: git(root, ['config', 'user.email']),
      },
    );
    console.log(
      published
        ? `Published master ${source} to ${BRANCH} (${published.slice(0, 7)}).`
        : `${BRANCH} already matches master ${source}; nothing to publish.`,
    );
  } finally {
    await rm(dest, { recursive: true, force: true, maxRetries: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
