import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import type { PlatformId } from '../../shared/types';
import { postWarnings,validatePost } from '../../shared/capabilities';
const execFileAsync=promisify(execFile);
export interface MediaMetadata{path:string;kind:'image'|'video';sizeBytes:number;width?:number;height?:number;durationS?:number;}
interface ProbeInfo{streams?:Array<{codec_type?:string;width?:number;height?:number;duration?:string|number}>;format?:{duration?:string|number};}
export function metadataFromProbe(base:MediaMetadata,info:ProbeInfo):MediaMetadata{const visual=info.streams?.find(stream=>stream.codec_type==='video'&&stream.width&&stream.height);const duration=info.format?.duration??info.streams?.find(stream=>stream.codec_type==='video')?.duration;return{...base,...(visual?.width?{width:Number(visual.width)}:{}),...(visual?.height?{height:Number(visual.height)}:{}),...(duration&&Number(duration)>0?{durationS:Number(duration)}:{})};}
export async function inspectMedia(path:string):Promise<MediaMetadata>{const file=await stat(path);const kind=/\.(mp4|mov|webm|mkv)$/i.test(extname(path))?'video':'image';const base={path,kind,sizeBytes:file.size} as MediaMetadata;try{const {stdout}=await execFileAsync('ffprobe',['-v','quiet','-print_format','json','-show_streams','-show_format',path]);return metadataFromProbe(base,JSON.parse(stdout) as ProbeInfo);}catch{return base;}}
export function validateMedia(platform:PlatformId,items:MediaMetadata[]):string[]{return validatePost(platform,{text:'',media:items});}
export function mediaWarnings(platform:PlatformId,items:MediaMetadata[]):string[]{return postWarnings(platform,{text:'',media:items});}
