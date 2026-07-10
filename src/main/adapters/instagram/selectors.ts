import { adapterConfigs } from '../configs';
export const instagramSelectors=adapterConfigs.find(config=>config.id==='instagram')!.selectors;
