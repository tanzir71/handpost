import { createAdapter } from '../factory';
import { adapterConfigs } from '../configs';
export const linkedinAdapter = createAdapter(adapterConfigs.find((config) => config.id === 'linkedin')!);
