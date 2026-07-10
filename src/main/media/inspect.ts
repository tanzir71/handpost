import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import type { PlatformId } from '../../shared/types';
import { capabilities } from '../../shared/capabilities';
const execFileAsync=promisify(execFile);
export interface MediaMetadata{path:string;kind:'image'|'video';sizeBytes:number;width?:number;height?:number;durationS?:number;}
export async function inspectMedia(path:string):Promise<MediaMetadata>{const file=await stat(path);const kind=/\.(mp4|mov|webm|mkv)$/i.test(extname(path))?'video':'image';const base={path,kind,sizeBytes:file.size} as MediaMetadata;try{const {stdout}=await execFileAsync('ffprobe',['-v','quiet','-print_format','json','-show_streams','-show_format',path]);const info=JSON.parse(stdout);const stream=info.streams?.find((s:any)=>s.codec_type===kind);return{...base,...(stream?.width?{width:Number(stream.width)}:{}),...(stream?.height?{height:Number(stream.height)}:{}),...(info.format?.duration?{durationS:Number(info.format.duration)}:{})};}catch{return base;}}
export function validateMedia(platform:PlatformId,items:MediaMetadata[]):string[]{const cap=capabilities[platform];const errors:string[]=[];if(items.length>cap.maxMedia)errors.push(`Maximum ${cap.maxMedia} media files`);for(const item of items){if(!cap.mediaKinds.includes(item.kind))errors.push(`${item.kind} is not supported`);if(cap.maxFileBytes&&item.sizeBytes>cap.maxFileBytes)errors.push(`${item.path} exceeds size limit`);if(cap.maxVideoSeconds&&item.durationS&&item.durationS>cap.maxVideoSeconds)errors.push(`Video exceeds ${cap.maxVideoSeconds} seconds`);if(item.width&&item.height){const ratio=item.width/item.height;if(platform==='instagram'&&(ratio<.8||ratio>1.91))errors.push('Instagram will crop outside 4:5–1.91:1');}}return errors;}
