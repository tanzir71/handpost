import type { RelayDatabase } from '../db/database';

export function recalculatePostStatus(db:RelayDatabase,postId:number):void{
 const statuses=db.prepare('SELECT status FROM post_targets WHERE post_id=?').pluck().all(postId) as string[];if(!statuses.length)return;
 let status='scheduled';
 if(statuses.every(value=>value==='published'))status='published';
 else if(statuses.some(value=>value==='published'))status='partial';
 else if(statuses.every(value=>['failed','needs_login','needs_attention','manual','unverified'].includes(value)))status='failed';
 else if(statuses.some(value=>value==='publishing'))status='publishing';
 db.prepare('UPDATE posts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,postId);
}
