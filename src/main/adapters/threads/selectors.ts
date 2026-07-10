import { adapterConfigs } from '../configs';
export const threadsSelectors=adapterConfigs.find(config=>config.id==='threads')!.selectors;
