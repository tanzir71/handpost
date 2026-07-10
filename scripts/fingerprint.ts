import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserEngine } from '../src/main/engine/browser';
const root=await mkdtemp(join(tmpdir(),'relay-fingerprint-'));const engine=new BrowserEngine(root,process.argv.includes('--chrome')?'chrome':'chromium');try{const result=await engine.fingerprint('mock');if(result.webdriver||result.cdpLeak)throw new Error(`Fingerprint leak detected: ${JSON.stringify(result)}`);console.log(`Fingerprint self-test passed: ${JSON.stringify(result)}`);}finally{await engine.close();await rm(root,{recursive:true,force:true});}
