import type { HandpostDatabase } from '../db/database';
const DAY=86_400_000;

export class CircuitBreaker {
 constructor(private db:HandpostDatabase){}

 trip(platform:string,now=new Date()):number[]{
  const key=`breaker:${platform}`;const recent=JSON.parse(String(this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key)??'[]')) as string[];
  const events=[...recent.filter(value=>now.getTime()-new Date(value).getTime()<7*DAY),now.toISOString()];const until=events.length>=2?'manual':new Date(now.getTime()+DAY).toISOString();
  this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(events));
  this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`${key}:until`,until);
  this.db.prepare("UPDATE accounts SET status='frozen' WHERE platform=?").run(platform);
  const posts=this.db.prepare("SELECT DISTINCT post_id FROM post_targets WHERE account_id=(SELECT id FROM accounts WHERE platform=?) AND status IN ('scheduled','publishing')").pluck().all(platform) as number[];
  this.db.prepare("UPDATE post_targets SET status='manual',error_code='platform_frozen',error_detail='Automation paused after suspected detection' WHERE account_id=(SELECT id FROM accounts WHERE platform=?) AND status IN ('scheduled','publishing')").run(platform);
  return posts;
 }

 isOpen(platform:string,now=new Date()):boolean{
  const key=`breaker:${platform}:until`;const until=this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key);
  if(until==='manual')return true;
  if(typeof until==='string'&&new Date(until)>now)return true;
  if(typeof until==='string'){this.db.prepare('DELETE FROM settings WHERE key=?').run(key);this.db.prepare("UPDATE accounts SET status='unknown' WHERE platform=? AND status='frozen'").run(platform);}
  return false;
 }

 reenable(platform:string):void{this.db.prepare('DELETE FROM settings WHERE key=?').run(`breaker:${platform}:until`);this.db.prepare("UPDATE accounts SET status='unknown' WHERE platform=?").run(platform);}
}
