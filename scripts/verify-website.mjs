/* global console, process */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('site');
const files = [
  'index.html',
  'styles.css',
  'main.js',
  'demo/index.html',
  'demo/demo.css',
  'demo/demo.js',
  'favicon.svg',
  'og.svg',
  'llms.txt',
];
const failures = [];
for (const relative of files) {
  try {
    const info = await stat(path.join(root, relative));
    if (!info.isFile() || !info.size) failures.push(`${relative} is empty`);
  } catch {
    failures.push(`${relative} is missing`);
  }
}
for (const relative of ['index.html', 'demo/index.html']) {
  const html = await readFile(path.join(root, relative), 'utf8');
  for (const token of ['<!doctype html', '<title', 'name="description"', 'href="/favicon.svg"'])
    if (!html.toLowerCase().includes(token.toLowerCase())) failures.push(`${relative} lacks ${token}`);
  if (html.includes('�')) failures.push(`${relative} contains replacement characters`);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const pathname = match[1].split(/[?#]/)[0];
    if (pathname === '/' || pathname === '/demo/') continue;
    try {
      await stat(path.join(root, pathname.slice(1)));
    } catch {
      failures.push(`${relative} references missing ${pathname}`);
    }
  }
}
const home = await readFile(path.join(root, 'index.html'), 'utf8');
for (const phrase of [
  'violates most platforms’ terms',
  'account loss is possible',
  'one adapter repair per month',
  'Instagram and TikTok remain fragile',
  'No live-posting demo exists',
])
  if (!home.toLowerCase().includes(phrase.toLowerCase()))
    failures.push(`homepage lacks required caveat: ${phrase}`);
if (home.indexOf('Before the product pitch') > home.indexOf('Schedule everywhere'))
  failures.push('risk disclosure does not precede product pitch');
const demo =
  (await readFile(path.join(root, 'demo/index.html'), 'utf8')) +
  (await readFile(path.join(root, 'demo/demo.js'), 'utf8'));
for (const phrase of [
  'MOCK SIMULATION',
  'fake timeline',
  'nothing is posted',
  'No platform request is permitted here',
])
  if (!demo.toLowerCase().includes(phrase.toLowerCase())) failures.push(`demo lacks disclosure: ${phrase}`);
if (failures.length) {
  console.error(failures.map((value) => `- ${value}`).join('\n'));
  process.exit(1);
}
console.log('Website contract verified: risks lead, mock demo disclosed, and all local assets resolve.');
