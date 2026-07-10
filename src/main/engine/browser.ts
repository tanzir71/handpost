import { chromium, type BrowserContext } from 'playwright';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlatformId } from '../../shared/types';

export class BrowserEngine {
  private contexts=new Map<PlatformId,BrowserContext>();
  constructor(private readonly profilesRoot:string,private readonly browserChannel:'chrome'|'chromium'='chrome'){}
  async context(platform:PlatformId,{headless=false}:{headless?:boolean}={}):Promise<BrowserContext>{
    const current=this.contexts.get(platform); if(current) return current;
    const profile=join(this.profilesRoot,platform); await mkdir(profile,{recursive:true}); await chmod(profile,0o700).catch(()=>undefined);
    const ctx=await chromium.launchPersistentContext(profile,{...(this.browserChannel==='chrome'?{channel:'chrome' as const}:{}),headless,viewport:{width:1280,height:900},args:['--disable-blink-features=AutomationControlled']});
    await ctx.addInitScript(() => { Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); });
    this.contexts.set(platform,ctx); ctx.on('close',()=>this.contexts.delete(platform)); return ctx;
  }
  async close(platform?:PlatformId):Promise<void>{ if(platform){await this.contexts.get(platform)?.close();this.contexts.delete(platform);return;} await Promise.all([...this.contexts.values()].map(c=>c.close()));this.contexts.clear(); }
  activeContextCount():number{return this.contexts.size;}
  async fingerprint(platform:PlatformId):Promise<{webdriver:boolean;cdpLeak:boolean}>{ const ctx=await this.context(platform);const page=await ctx.newPage();await page.goto('data:text/html,<title>Relay fingerprint</title>');const result=await page.evaluate(()=>({webdriver:Boolean(navigator.webdriver),cdpLeak:['cdc_adoQpoasnfa76pfcZLmcfl_Array','__playwright__binding__'].some(k=>k in window)}));await page.close();return result; }
}
