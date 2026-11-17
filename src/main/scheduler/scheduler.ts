import { join } from 'node:path';
import PQueue from 'p-queue';
import type { BrowserEngine } from '../engine/browser';
import type { HandpostDatabase } from '../db/database';
import type { ErrorClass, MediaInput, PlatformId, PublishError, RenderedPost } from '../../shared/types';
import { getAdapter } from '../adapters';
import type { PlatformAdapter } from '../adapters/types';
import { StepReporter } from '../engine/reporter';
import { CircuitBreaker } from './circuit-breaker';
import { classifyError, retryDelay } from './retry';
import { recalculatePostStatus } from './status';

type DueRow={id:number;post_id:number;account_id:number;base_text:string;override_text:string|null;first_comment:string|null;options_json:string;platform:PlatformId;profile_dir:string;attempt_count:number};

export class Scheduler {
 private timer?:ReturnType<typeof setInterval>;
 private queue=new PQueue({concurrency:1});
 private breaker:CircuitBreaker;
 private nextAllowed=new Map<PlatformId,number>();
 private cleanup:Promise<void>=Promise.resolve();

 constructor(private db:HandpostDatabase,private engine:BrowserEngine,private notify:(title:string,body:string)=>void=()=>{},private resolveAdapter:(id:PlatformId)=>PlatformAdapter=getAdapter,private artifactDir=join(process.cwd(),'handpost-data','artifacts')){this.breaker=new CircuitBreaker(db);}

 start(){void this.handleOverdue();this.timer=setInterval(()=>void this.tick(),30_000);}
 stop(){if(this.timer)clearInterval(this.timer);}

 async handleOverdue(now=new Date()){
  const cutoff=new Date(now.getTime()-2*3_600_000).toISOString();
  const recent=Number(this.db.prepare("SELECT count(*) FROM post_targets WHERE status='scheduled' AND scheduled_at_utc>=? AND scheduled_at_utc<=?").pluck().get(cutoff,now.toISOString()));
  if(recent>0)this.notify('Handpost is publishing missed posts',`${recent} post${recent===1?' is':'s are'} less than two hours overdue.`);
  const stale=this.db.prepare("SELECT DISTINCT post_id FROM post_targets WHERE status='scheduled' AND scheduled_at_utc<?").pluck().all(cutoff) as number[];
  this.db.prepare("UPDATE post_targets SET status='needs_attention',error_code='overdue' WHERE status='scheduled' AND scheduled_at_utc<?").run(cutoff);
  for(const postId of stale)this.recalculatePost(postId);
  await this.tick(now);
 }

 async tick(now=new Date()){
  const rows=this.db.prepare("SELECT t.*,p.base_text,a.platform,a.profile_dir FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN accounts a ON a.id=t.account_id WHERE t.status='scheduled' AND t.jittered_at_utc<=? ORDER BY t.jittered_at_utc").all(now.toISOString()) as DueRow[];
  const opened=new Set<PlatformId>();
  for(const row of rows){
   if(this.breaker.isOpen(row.platform)){this.db.prepare("UPDATE post_targets SET status='manual',error_code='platform_frozen' WHERE id=?").run(row.id);this.recalculatePost(row.post_id);continue;}
   if(row.platform!=='mock'&&!this.withinGuardrails(row,now))continue;
   const changed=this.db.prepare("UPDATE post_targets SET status='publishing' WHERE id=? AND status='scheduled'").run(row.id).changes;
   if(!changed)continue;
   if(row.platform!=='mock')this.nextAllowed.set(row.platform,now.getTime()+(row.platform==='instagram'?10:3)*60_000);
   opened.add(row.platform);
   void this.queue.add(()=>this.publish(row));
  }
  if(opened.size){
   this.cleanup=this.queue.onIdle().then(async()=>{for(const platform of opened)await this.engine.close(platform).catch(()=>undefined);});
  }
 }

 private withinGuardrails(row:DueRow,now:Date):boolean{
  const reserved=this.nextAllowed.get(row.platform);
  if(reserved&&reserved>now.getTime()){this.db.prepare('UPDATE post_targets SET jittered_at_utc=? WHERE id=?').run(new Date(reserved+1000).toISOString(),row.id);return false;}
  const start=new Date(now);start.setHours(0,0,0,0);
  const configured=this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(`dailyCap:${row.platform}`);
  const cap=Number(configured??10);
  const count=Number(this.db.prepare("SELECT count(*) FROM publish_attempts pa JOIN post_targets t ON t.id=pa.target_id JOIN accounts a ON a.id=t.account_id WHERE a.platform=? AND pa.outcome='published' AND pa.finished_at>=?").pluck().get(row.platform,start.toISOString()));
  if(count>=cap){this.db.prepare("UPDATE post_targets SET status='needs_attention',error_code='daily_cap',error_detail=? WHERE id=?").run(`Daily cap of ${cap} reached`,row.id);this.recalculatePost(row.post_id);this.notify('Handpost daily cap reached',`${row.platform} is paused until tomorrow.`);return false;}
  const latest=this.db.prepare("SELECT max(pa.finished_at) FROM publish_attempts pa JOIN post_targets t ON t.id=pa.target_id JOIN accounts a ON a.id=t.account_id WHERE a.platform=? AND pa.outcome='published'").pluck().get(row.platform);
  const gapMs=(row.platform==='instagram'?10:3)*60_000;
  if(typeof latest==='string'&&now.getTime()-new Date(latest).getTime()<gapMs){const next=new Date(new Date(latest).getTime()+gapMs+1000).toISOString();this.db.prepare('UPDATE post_targets SET jittered_at_utc=? WHERE id=?').run(next,row.id);return false;}
  return true;
 }

 async idle(){await this.queue.onIdle();await this.cleanup;}

 private render(row:DueRow):RenderedPost{
  const media=this.db.prepare('SELECT id,path,kind,alt_text AS altText,width,height,duration_s AS durationS,size_bytes AS sizeBytes FROM media WHERE post_id=? ORDER BY order_idx,id').all(row.post_id) as Array<MediaInput&{id:number}>;
  let options:Record<string,string|boolean>={};
  try{options=JSON.parse(row.options_json) as Record<string,string|boolean>;}catch{options={};}
  const renderedMedia=media.map(item=>({...item,...(typeof options[`alt:${item.id}`]==='string'?{altText:String(options[`alt:${item.id}`])}:{})}));
  let thread:string[]=[];if(typeof options.threadParts==='string'){try{const value=JSON.parse(options.threadParts);if(Array.isArray(value))thread=value.filter(part=>typeof part==='string'&&part.trim()).map(part=>part.trim());}catch{thread=[];}}
  return{text:row.override_text??row.base_text,...(thread.length?{thread}:{}),firstComment:row.first_comment,media:renderedMedia,options,artifactDir:this.artifactDir};
 }

 private async publish(row:DueRow){
  const started=new Date().toISOString();let reporter:StepReporter|undefined;
  try{
   if(this.breaker.isOpen(row.platform)){this.db.prepare("UPDATE post_targets SET status='manual',error_code='platform_frozen' WHERE id=?").run(row.id);this.recalculatePost(row.post_id);return;}
   const adapter=this.resolveAdapter(row.platform);const post=this.render(row);const validation=adapter.validate(post);
   if(validation.length)throw Object.assign(new Error(validation.join('; ')),{errorClass:'content',code:'invalid_content'}) as PublishError;
   const headless=row.platform==='mock'||(row.platform==='bluesky'&&this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(`headless:${row.platform}`)==='true');
   const ctx=await this.engine.context(row.platform,{headless,background:!headless});const page=ctx.pages()[0]??await ctx.newPage();reporter=new StepReporter(page,this.artifactDir);
   const session=await adapter.checkSession(ctx);
   if(session!=='ok'){const detection=session==='challenged';throw Object.assign(new Error(`Session ${session}`),{errorClass:detection?'suspected_detection':'session',code:session}) as PublishError;}
   this.db.prepare("UPDATE accounts SET status='ok',last_checked_at=CURRENT_TIMESTAMP WHERE id=?").run(row.account_id);
   this.db.prepare('UPDATE post_targets SET attempt_count=attempt_count+1 WHERE id=?').run(row.id);
   await adapter.publish(ctx,post,reporter);
   const proof=await adapter.verify(ctx,post);const status=proof.found?'published':'unverified';
   this.db.prepare('UPDATE post_targets SET status=?,published_url=? WHERE id=?').run(status,proof.url??null,row.id);
   this.db.prepare('INSERT INTO publish_attempts(target_id,started_at,finished_at,outcome,step_log_json,screenshot_path) VALUES (?,?,?,?,?,?)').run(row.id,started,new Date().toISOString(),status,JSON.stringify(reporter.logs),proof.screenshotPath??null);
   this.recalculatePost(row.post_id);
   if(!proof.found)this.notify('Handpost could not verify post','The platform accepted it, but proof was not found.');
  }catch(error){
   const e=error as Partial<PublishError>;const errorClass=(e.errorClass??classifyError(error)) as ErrorClass;
   if(errorClass==='session')this.db.prepare("UPDATE accounts SET status='needs_login',last_checked_at=CURRENT_TIMESTAMP WHERE id=?").run(row.account_id);
   if(errorClass==='suspected_detection'){const affected=this.breaker.trip(row.platform);for(const postId of affected)this.recalculatePost(postId);}
   if(errorClass==='ui_drift'&&reporter)await reporter.saveDriftSnapshot(row.platform).catch(()=>undefined);
   const delay=retryDelay(errorClass,row.attempt_count+1);
   const status=errorClass==='suspected_detection'?'manual':delay===null?(errorClass==='session'?'needs_login':'failed'):'scheduled';
   const next=delay===null?null:new Date(Date.now()+delay).toISOString();
   this.db.prepare('UPDATE post_targets SET status=?,jittered_at_utc=COALESCE(?,jittered_at_utc),error_code=?,error_detail=? WHERE id=?').run(status,next,e.code??errorClass,String(e.message??error),row.id);
   const screenshot=[...(reporter?.logs??[])].reverse().find(log=>log.outcome==='failed')?.screenshotPath??null;
   this.db.prepare('INSERT INTO publish_attempts(target_id,started_at,finished_at,outcome,step_log_json,screenshot_path,error_class) VALUES (?,?,?,?,?,?,?)').run(row.id,started,new Date().toISOString(),status,JSON.stringify(reporter?.logs??[]),screenshot,errorClass);
   this.recalculatePost(row.post_id);
   this.notify(errorClass==='suspected_detection'?'Handpost automation frozen':'Handpost publishing failed',`${row.platform}: ${String(e.message??error)}`);
  }
 }

 private recalculatePost(postId:number){recalculatePostStatus(this.db,postId);}
}
