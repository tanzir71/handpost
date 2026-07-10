import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const youtubeAdapter=createAdapter(adapterConfigs.find(config=>config.id==='youtube')!);
