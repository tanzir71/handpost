import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const instagramAdapter=createAdapter(adapterConfigs.find(config=>config.id==='instagram')!);
