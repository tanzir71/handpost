import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserEngine } from '../src/main/engine/browser';
const root=await mkdtemp(join(tmpdir(),'relay-fingerprint-'));const chrome=process.argv.includes('--chrome');const engine=new BrowserEngine(root,chrome?'chrome':'chromium');try{const result=await engine.fingerprint('mock',{headless:!chrome});if(result.webdriver||result.cdpLeak)throw new Error(`Fingerprint leak detected: ${JSON.stringify(result)}`);console.log(`Fingerprint self-test passed: ${JSON.stringify(result)}`);}finally{await engine.close();await rm(root,{recursive:true,force:true});}
