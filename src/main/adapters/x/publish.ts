import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const publish = createAdapter(adapterConfigs.find((config) => config.id === 'x')!).publish;
