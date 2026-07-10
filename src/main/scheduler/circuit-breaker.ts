import type { RelayDatabase } from '../db/database';
const DAY=86_400_000;
export class CircuitBreaker {
 constructor(private db:RelayDatabase){}
 trip(platform:string,now=new Date()):void {const key=`breaker:${platform}`;const recent=JSON.parse(String(this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key)??'[]')) as string[];const events=[...recent.filter(v=>now.getTime()-new Date(v).getTime()<7*DAY),now.toISOString()];const until=events.length>=2?'manual':new Date(now.getTime()+DAY).toISOString();this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(events));this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`${key}:until`,until);this.db.prepare("UPDATE accounts SET status='frozen' WHERE platform=?").run(platform);}
 isOpen(platform:string,now=new Date()):boolean {const until=this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get(`breaker:${platform}:until`);return until==='manual'||(typeof until==='string'&&new Date(until)>now);}
}
