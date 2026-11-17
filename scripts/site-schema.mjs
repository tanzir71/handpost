/* global console */
// Copies schema/*.json into site/schema/ so the landing page publishes the inbox JSON Schemas.
// Mirrors the Pages workflow step `mkdir -p site/schema && cp schema/*.json site/schema/`; site/schema/ is git-ignored.
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const from = path.resolve('schema');
const to = path.resolve('site', 'schema');
await mkdir(to, { recursive: true });
const names = (await readdir(from)).filter((name) => name.endsWith('.json'));
for (const name of names) await copyFile(path.join(from, name), path.join(to, name));
console.log(`Copied ${names.length} schema file(s) to site/schema/: ${names.join(', ')}`);
