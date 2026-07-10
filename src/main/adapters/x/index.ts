import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const xAdapter=createAdapter(adapterConfigs.find(config=>config.id==='x')!);
