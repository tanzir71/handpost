import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const pinterestAdapter = createAdapter(adapterConfigs.find((config) => config.id === 'pinterest')!);
