import { adapterConfigs } from '../configs';
export const blueskySelectors=adapterConfigs.find(config=>config.id==='bluesky')!.selectors;
