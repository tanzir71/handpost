import { chromium, type BrowserContext } from 'playwright';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlatformId } from '../../shared/types';

interface ManagedContext{context:BrowserContext;background:boolean;headless:boolean;}
interface ContextOptions{headless?:boolean;background?:boolean;}

export class BrowserEngine {
  private contexts=new Map<PlatformId,ManagedContext>();
  constructor(private readonly profilesRoot:string,private readonly browserChannel:'chrome'|'chromium'='chrome'){}

  async context(platform:PlatformId,{headless=false,background=false}:ContextOptions={}):Promise<BrowserContext>{
    const current=this.contexts.get(platform);
    if(current&&!(current.headless&&!headless)&&!(current.background&&!background))return current.context;
    if(current)await this.close(platform);
    const profile=join(this.profilesRoot,platform);await mkdir(profile,{recursive:true});await chmod(profile,0o700).catch(()=>undefined);
    const args=['--disable-blink-features=AutomationControlled',...(background&&!headless?['--window-position=-32000,-32000']:[])];
    const context=await chromium.launchPersistentContext(profile,{...(this.browserChannel==='chrome'?{channel:'chrome' as const}:{}),headless,viewport:{width:1280,height:900},args});
    await context.addInitScript(() => { Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); });
    this.contexts.set(platform,{context,background,headless});context.on('close',()=>this.contexts.delete(platform));return context;
  }

  async close(platform?:PlatformId):Promise<void>{
    if(platform){await this.contexts.get(platform)?.context.close();this.contexts.delete(platform);return;}
    await Promise.all([...this.contexts.values()].map(entry=>entry.context.close()));this.contexts.clear();
  }

  activeContextCount():number{return this.contexts.size;}

  async fingerprint(platform:PlatformId,{headless=false}:{headless?:boolean}={}):Promise<{webdriver:boolean;cdpLeak:boolean}>{
    const context=await this.context(platform,{headless});const page=await context.newPage();await page.goto('data:text/html,<title>Relay fingerprint</title>');
    const result=await page.evaluate(()=>({webdriver:Boolean(navigator.webdriver),cdpLeak:['cdc_adoQpoasnfa76pfcZLmcfl_Array','__playwright__binding__'].some(key=>key in window)}));await page.close();return result;
  }
}
