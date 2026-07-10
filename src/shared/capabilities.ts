import type { CapabilityManifest, PlatformId, RenderedPost } from './types';

export const capabilities: Record<PlatformId, CapabilityManifest> = {
  mock: { platform:'mock', label:'MockSocial', maxChars:1000, maxMedia:4, mediaKinds:['image','video'] },
  x: { platform:'x', label:'X', maxChars:280, maxMedia:4, mediaKinds:['image','video'], maxFileBytes:512*1024*1024, warnings:[{at:250,message:'Approaching X limit'}] },
  linkedin: { platform:'linkedin', label:'LinkedIn', maxChars:3000, maxMedia:9, mediaKinds:['image','video'], warnings:[{at:210,message:'Text will fold behind “see more”'}] },
  bluesky: { platform:'bluesky', label:'Bluesky', maxChars:300, maxMedia:4, mediaKinds:['image'] },
  threads: { platform:'threads', label:'Threads', maxChars:500, maxMedia:10, mediaKinds:['image','video'] },
  facebook: { platform:'facebook', label:'Facebook Page', maxChars:63206, maxMedia:10, mediaKinds:['image','video'] },
  instagram: { platform:'instagram', label:'Instagram', maxChars:2200, maxMedia:10, mediaKinds:['image','video'], maxFileBytes:100*1024*1024, conservative:true },
  tiktok: { platform:'tiktok', label:'TikTok', maxChars:2200, maxMedia:1, mediaKinds:['video'], maxVideoSeconds:600, maxFileBytes:4*1024*1024*1024 },
  youtube: { platform:'youtube', label:'YouTube Shorts', maxChars:5000, maxMedia:1, mediaKinds:['video'], maxVideoSeconds:60, maxFileBytes:256*1024*1024*1024 },
  pinterest: { platform:'pinterest', label:'Pinterest', maxChars:500, maxMedia:1, mediaKinds:['image','video'] },
};

export function countText(platform: PlatformId, text: string): number {
  if (platform === 'x') return Array.from(text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))).length;
  if (platform === 'bluesky') return Array.from(text.normalize('NFC')).length;
  return Array.from(text).length;
}
export function validatePost(platform: PlatformId, post: RenderedPost): string[] {
  const cap = capabilities[platform]; const errors: string[] = [];
  if (countText(platform, post.text) > cap.maxChars) errors.push(`Text exceeds ${cap.maxChars} characters`);
  if (post.media.length > cap.maxMedia) errors.push(`Maximum ${cap.maxMedia} media files`);
  if (post.media.some(m => !cap.mediaKinds.includes(m.kind))) errors.push(`Unsupported media type for ${cap.label}`);
  if (cap.maxFileBytes && post.media.some(m=>(m.sizeBytes??0)>cap.maxFileBytes!)) errors.push(`Media exceeds ${Math.round(cap.maxFileBytes/1024/1024)} MB`);
  if (cap.maxVideoSeconds && post.media.some(m=>m.kind==='video'&&(m.durationS??0)>cap.maxVideoSeconds!)) errors.push(`Video exceeds ${cap.maxVideoSeconds} seconds`);
  if (platform==='instagram'&&post.media.some(m=>m.width&&m.height&&(m.width/m.height<.8||m.width/m.height>1.91))) errors.push('Instagram will crop media outside 4:5–1.91:1');
  if ((platform === 'tiktok' || platform === 'youtube' || platform === 'pinterest') && post.media.length === 0) errors.push(`${cap.label} requires media`);
  return errors;
}
