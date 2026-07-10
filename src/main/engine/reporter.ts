import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from 'playwright';
import type { StepLog } from '../../shared/types';
import { sanitizeDom } from './sanitize';

export class StepReporter {
  readonly logs:StepLog[]=[];
  constructor(private readonly page:Page,private readonly artifactDir:string){}
  async step<T>(name:string,fn:()=>Promise<T>):Promise<T>{
    const startedAt=new Date().toISOString();
    try { const value=await fn(); this.logs.push({name,startedAt,finishedAt:new Date().toISOString(),outcome:'ok'}); return value; }
    catch(error){ const path=`${this.artifactDir}/${Date.now()}-${slug(name)}.png`; await mkdir(dirname(path),{recursive:true}); await this.page.screenshot({path,fullPage:true}).catch(()=>undefined); this.logs.push({name,startedAt,finishedAt:new Date().toISOString(),outcome:'failed',detail:error instanceof Error?error.message:String(error),screenshotPath:path}); throw error; }
  }
  async saveDriftSnapshot(platform:string):Promise<string>{const path=`tests/fixtures/_drift/${platform}-${Date.now()}.html`;await mkdir(dirname(path),{recursive:true});await writeFile(path,sanitizeDom(await this.page.content()),'utf8');return path;}
}
const slug=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-');
