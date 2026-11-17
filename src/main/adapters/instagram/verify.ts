import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const verify = createAdapter(adapterConfigs.find((config) => config.id === 'instagram')!).verify;
