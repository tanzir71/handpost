import { adapterConfigs } from '../configs';
export const facebookSelectors=adapterConfigs.find(config=>config.id==='facebook')!.selectors;
