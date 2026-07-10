import type { AdapterConfig } from './types';

export function withSelectorFallbacks(overrides:Partial<AdapterConfig['selectors']>={}):AdapterConfig['selectors']{
 const selectors:AdapterConfig['selectors']={loggedIn:['[data-relay="logged-in"]','[aria-label="Profile"]'],challenged:['[data-relay="challenge"]','text=/captcha|unusual activity|checkpoint/i'],composer:['[data-relay="composer"]','form'],text:['[data-relay="text"]','[contenteditable="true"]','textarea'],file:['input[type="file"]','input[accept*="image"],input[accept*="video"]'],submit:['[data-relay="submit"]','button[type="submit"]'],success:['[data-relay="success"]','text=/posted|published|shared/i'],post:['[data-relay="post"]','article']};
 for(const key of Object.keys(overrides) as Array<keyof AdapterConfig['selectors']>)selectors[key]=[...(overrides[key]??[]),...selectors[key]];
 return selectors;
}

export const mockSelectors=withSelectorFallbacks();
