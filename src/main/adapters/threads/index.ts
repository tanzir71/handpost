import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const threadsAdapter = createAdapter(adapterConfigs.find((config) => config.id === 'threads')!);
