import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe,expect,it } from 'vitest';
import { createLocalLogger } from '../../src/main/logging';

describe('local logger privacy',()=>{it('redacts credential-shaped fields',async()=>{const root=mkdtempSync(join(tmpdir(),'relay-log-'));try{const local=createLocalLogger(root);local.logger.info({cookie:'session-secret',token:'token-secret',nested:{password:'password-secret'}},'privacy check');await local.close();const content=readFileSync(local.path,'utf8');expect(content).not.toContain('session-secret');expect(content).not.toContain('token-secret');expect(content).not.toContain('password-secret');expect(content).toContain('[REDACTED]');}finally{rmSync(root,{recursive:true,force:true});}});});
