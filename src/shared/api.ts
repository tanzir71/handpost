import type { PlatformId } from './types';
export interface HandpostSnapshot {accounts:any[];posts:any[];targets:any[];media:any[];attempts:any[];slots:any[];templates:any[];settings:any[];}
export interface HandpostApi {
 snapshot():Promise<HandpostSnapshot>; savePost(input:{id?:number;text:string;status:'draft'|'scheduled';targets:Array<{accountId:number;scheduledAt?:string;overrideText?:string;firstComment?:string;options?:Record<string,string|boolean>}>}):Promise<number>;
 queuePost(input:{id?:number;text:string;targets:Array<{accountId:number;overrideText?:string;firstComment?:string;options?:Record<string,string|boolean>}>}):Promise<number>;
 reschedule(input:{targetId:number;scheduledAt:string}):Promise<void>; retry(input:{targetId:number}):Promise<void>; connect(input:{platform:PlatformId}):Promise<void>; attachMedia(postId:number):Promise<any[]>; addMedia(input:{postId:number;files:Array<{name:string;mime:string;bytes:Uint8Array}>}):Promise<any[]>;updateMediaAlt(input:{mediaId:number;altText:string}):Promise<void>;
 reenable(platform:PlatformId):Promise<void>;
 saveTemplate(input:{name:string;body:string;variables:string[]}):Promise<number>; saveSetting(input:{key:string;value:string}):Promise<void>; csvImport(input:{csv:string;dryRun:boolean}):Promise<any[]>;
 saveAccountSettings(input:{accountId:number;platform:PlatformId;dailyCap:number;headless:boolean;slots:Array<{weekday:number;timeLocal:string}>}):Promise<void>;
 exportData():Promise<string>; importData():Promise<void>; openManual(targetId:number):Promise<void>;
 openExternal(url:string):Promise<void>;
 readArtifact(path:string):Promise<string>;
}
