import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sanitizeDom } from './sanitize';

function arg(name:string,fallback:string){const prefix=`--${name}=`;return process.argv.find(v=>v.startsWith(prefix))?.slice(prefix.length)??fallback;}
const platform=arg('platform','example'); const step=arg('step','compose'); const url=arg('url','https://example.com');
const output=resolve(`tests/fixtures/${platform}/${step}.html`); const browser=await chromium.launch({headless:true});
try { const page=await browser.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});const html=sanitizeDom(await page.content());await mkdir(dirname(output),{recursive:true});await writeFile(output,html,'utf8');console.log(`Saved sanitized fixture: ${output}`); } finally { await browser.close(); }
