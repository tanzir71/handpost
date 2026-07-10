import { describe,expect,it } from 'vitest';
import { validateMedia } from '../../src/main/media/inspect';
describe('media validation',()=>{it('rejects an oversized-duration Shorts video',()=>expect(validateMedia('youtube',[{path:'long.mp4',kind:'video',sizeBytes:100,durationS:61}])).toContain('Video exceeds 60 seconds'));it('warns about Instagram crop ratios',()=>expect(validateMedia('instagram',[{path:'wide.jpg',kind:'image',sizeBytes:100,width:2000,height:500}])[0]).toMatch(/crop/));});
