/* global console, process */
// Static checks for the GitHub Pages site (docs/LANDING_PAGE.md §1 and §3). Run `node scripts/site-schema.mjs` first
// locally; the Pages workflow copies schema/*.json into site/schema/ before calling this script.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('site');
const COFFEE = 'https://buymeacoffee.com/tanzir';
const REPO = 'https://github.com/tanzir71/handpost';
const failures = [];
const fail = (message) => failures.push(message);

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

// 1. Required files.
const required = [
  '.nojekyll',
  'index.html',
  'styles.css',
  'main.js',
  'favicon.svg',
  'og.png',
  'llms.txt',
  'assets/inbox.png',
  'demo/index.html',
  'demo/demo.css',
  'demo/demo.js',
  'fonts/instrument-serif-latin-400-normal.woff2',
  'fonts/instrument-sans-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/OFL-InstrumentSerif.txt',
  'fonts/OFL-InstrumentSans.txt',
  'fonts/OFL-IBMPlexMono.txt',
];
for (const file of required) {
  const full = path.join(root, file);
  if (!(await exists(full))) fail(`${file} is missing`);
  else if (file !== '.nojekyll' && !(await stat(full)).size) fail(`${file} is empty`);
}
if (!(await exists(path.join(root, 'schema/handpost-post.v1.schema.json'))))
  fail('schema/handpost-post.v1.schema.json is missing (run `node scripts/site-schema.mjs` first)');
for (const legacy of ['vercel.json', '.vercelignore', 'DEPLOY_VERCEL.md'])
  if (await exists(path.resolve(legacy)))
    fail(`${legacy} should be deleted (the site deploys to GitHub Pages)`);

// 2. Every reference in HTML and CSS: relative, resolvable, and never another origin for page resources.
const files = await walk(root);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const cssFiles = files.filter((file) => file.endsWith('.css'));
const idsCache = new Map();
async function idsOf(file) {
  if (!idsCache.has(file)) {
    const html = await readFile(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])));
  }
  return idsCache.get(file);
}
function attributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1].toLowerCase()] = match[2];
  return attrs;
}
async function checkReference(source, url, { kind, resource }) {
  const where = `${rel(source)}: ${kind} "${url}"`;
  if (!url || url.startsWith('data:') || url.startsWith('mailto:')) return;
  if (url.startsWith('//')) return fail(`${where} is protocol-relative (another origin)`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (resource) fail(`${where} loads from another origin — self-host it`);
    else if (!/^https:\/\//.test(url)) fail(`${where} is not https`);
    if (url.includes('tanzir71/scheduler')) fail(`${where} points at the old repository`);
    return;
  }
  if (url.startsWith('/')) return fail(`${where} is root-absolute; use a relative URL so /handpost/ works`);
  const [pathname, hash] = url.split('#');
  const clean = pathname.split('?')[0];
  let target = clean ? path.resolve(path.dirname(source), decodeURIComponent(clean)) : source;
  if (clean.endsWith('/') || (clean && !path.extname(clean))) target = path.join(target, 'index.html');
  if (!target.startsWith(root + path.sep)) return fail(`${where} escapes site/`);
  if (!(await exists(target))) return fail(`${where} does not resolve to a file in site/`);
  if (hash && target.endsWith('.html') && !(await idsOf(target)).has(hash))
    fail(`${where} points at a missing #${hash}`);
}

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const name = rel(file);
  for (const token of [
    '<!doctype html',
    '<html lang="en"',
    '<title>',
    'name="description"',
    'name="viewport"',
  ])
    if (!html.toLowerCase().includes(token.toLowerCase())) fail(`${name} lacks ${token}`);
  if (!/<link rel="icon" href="(?:\.\/|\.\.\/)favicon\.svg"/.test(html))
    fail(`${name} lacks a relative favicon`);
  if (html.includes('�')) fail(`${name} contains replacement characters`);
  if (/\bRelay\b/.test(html)) fail(`${name} still says Relay`);
  for (const [tag, tagName] of [...html.matchAll(/<([a-z][\w-]*)\b[^>]*>/gi)].map((match) => [
    match[0],
    match[1],
  ])) {
    const attrs = attributes(tag);
    const lower = tagName.toLowerCase();
    const resource = !(lower === 'a' || (lower === 'link' && /\bcanonical\b/.test(attrs.rel ?? '')));
    if (attrs.href !== undefined)
      await checkReference(file, attrs.href, { kind: `<${lower} href>`, resource });
    if (attrs.src !== undefined)
      await checkReference(file, attrs.src, { kind: `<${lower} src>`, resource: true });
    if (attrs.srcset !== undefined)
      for (const candidate of attrs.srcset.split(',').map((part) => part.trim().split(/\s+/)[0]))
        await checkReference(file, candidate, { kind: `<${lower} srcset>`, resource: true });
    if (lower === 'meta' && /^og:image$/.test(attrs.property ?? ''))
      await checkReference(file, attrs.content, { kind: 'og:image', resource: true });
    if (lower === 'img' && !attrs.alt?.trim()) fail(`${name}: <img src="${attrs.src}"> needs alt text`);
    if (attrs.target === '_blank' && !/\bnoopener\b/.test(attrs.rel ?? ''))
      fail(`${name}: target=_blank link ${attrs.href} needs rel="noopener"`);
  }
  if (/<iframe\b/i.test(html)) fail(`${name} embeds an iframe`);
  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    if (/@import|url\(\s*['"]?(?:https?:)?\/\//i.test(block[1]))
      fail(`${name}: inline style loads another origin`);
}
for (const file of cssFiles) {
  const css = await readFile(file, 'utf8');
  if (/@import/i.test(css)) fail(`${rel(file)} uses @import; keep one stylesheet with self-hosted fonts`);
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g))
    await checkReference(file, match[1], { kind: 'css url()', resource: true });
}

// 3. Landing page content contract.
const home = await readFile(path.join(root, 'index.html'), 'utf8');
if (!home.includes('<title>Handpost — your posts, delivered by hand</title>'))
  fail('index.html title is not the spec title');
if (!/<meta name="theme-color" content="#F4EFE6">/i.test(home)) fail('index.html lacks theme-color #F4EFE6');
if (!home.includes(`href="${REPO}"`)) fail(`index.html does not link the repository ${REPO}`);
if (home.includes('/releases/latest')) fail('index.html links /releases/latest, but no release exists yet');
for (const id of ['how', 'automation', 'platforms', 'caveats', 'faq', 'support', 'download'])
  if (!(await idsOf(path.join(root, 'index.html'))).has(id)) fail(`index.html lacks #${id}`);
const section = (pattern) => home.match(pattern)?.[0] ?? '';
const caveats = section(/<section[^>]*id="caveats"[\s\S]*?<\/section>/);
for (const phrase of [
  'violates most platforms’ terms',
  'account loss is possible',
  'one adapter repair per month',
  'Instagram and TikTok remain fragile',
  'No live-posting demo exists',
  'can publish to your connected accounts',
])
  if (!caveats.toLowerCase().includes(phrase.toLowerCase())) fail(`#caveats lacks: ${phrase}`);
const platforms = section(/<section[^>]*id="platforms"[\s\S]*?<\/section>/);
if (!/<table\b[\s\S]*<\/table>/.test(platforms)) fail('#platforms has no <table>');
if ((platforms.match(/<th scope="row">/g) ?? []).length !== 9)
  fail('#platforms table should list nine platforms');
const support = section(/<section[^>]*id="support"[\s\S]*?<\/section>/);
const footer = section(/<footer\b[\s\S]*?<\/footer>/);
if (!support.includes(`href="${COFFEE}"`)) fail('the support section lacks the Buy Me a Coffee link');
if (!footer.includes(`href="${COFFEE}"`)) fail('the footer lacks the Buy Me a Coffee link');
if (!home.includes('Fueling open-source code, local utilities, and late-night builds.'))
  fail('support headline does not match the spec');
if (home.indexOf('id="support"') > home.indexOf('<footer'))
  fail('the support section must sit above the footer');
if (/buymeacoffee\.com\/[^"]*\.js|bmc-widget/i.test(home))
  fail('no Buy Me a Coffee widget script is allowed');

// 4. Design tokens copied from the app stay identical.
const tokens = await readFile(path.resolve('src/renderer/styles/tokens.css'), 'utf8');
const pairs = [
  ...tokens.matchAll(/(--hp-(?:bg|line|text|accent|brand|status)-[\w-]+):\s*(#[0-9a-f]{3,8})/gi),
];
for (const css of ['styles.css', 'demo/demo.css']) {
  const content = (await readFile(path.join(root, css), 'utf8')).toLowerCase();
  const missing = pairs.filter(([, name, value]) => !content.includes(`${name}: ${value}`.toLowerCase()));
  if (missing.length)
    fail(`${css} tokens differ from tokens.css: ${missing.map((pair) => pair[1]).join(', ')}`);
}

// 5. Mock demo disclosures and llms.txt.
const demo =
  (await readFile(path.join(root, 'demo/index.html'), 'utf8')) +
  (await readFile(path.join(root, 'demo/demo.js'), 'utf8'));
for (const phrase of [
  'MOCK SIMULATION',
  'fake timeline',
  'nothing is posted',
  'No platform request is permitted here',
])
  if (!demo.toLowerCase().includes(phrase.toLowerCase())) fail(`demo lacks disclosure: ${phrase}`);
const llms = await readFile(path.join(root, 'llms.txt'), 'utf8');
if (/\bRelay\b/.test(llms) || !llms.includes('Handpost')) fail('llms.txt must describe Handpost, not Relay');
if (!llms.includes('INBOX_PROTOCOL.md')) fail('llms.txt lacks the inbox protocol line');
for (const file of files.filter((name) => /\.(js|txt|svg)$/.test(name)))
  if ((await readFile(file, 'utf8')).includes('tanzir71/scheduler'))
    fail(`${rel(file)} links the old repository`);

if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join('\n'));
  process.exit(1);
}
console.log(
  `Website verified: ${htmlFiles.length} pages, ${cssFiles.length} stylesheets — relative links resolve, no third-party resources, caveats, support and footer links present, schema published.`,
);
