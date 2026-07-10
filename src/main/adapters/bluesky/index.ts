import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const blueskyAdapter=createAdapter(adapterConfigs.find(config=>config.id==='bluesky')!);
