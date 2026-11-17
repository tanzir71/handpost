import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const tiktokAdapter = createAdapter(adapterConfigs.find((config) => config.id === 'tiktok')!);
