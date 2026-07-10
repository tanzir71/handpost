import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const facebookAdapter=createAdapter(adapterConfigs.find(config=>config.id==='facebook')!);
