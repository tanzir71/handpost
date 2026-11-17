import type { AdapterConfig } from './types';

export function withSelectorFallbacks(overrides:Partial<AdapterConfig['selectors']>={}):AdapterConfig['selectors']{
 const selectors:AdapterConfig['selectors']={loggedIn:['[data-handpost="logged-in"]','[aria-label="Profile"]'],challenged:['[data-handpost="challenge"]','text=/captcha|unusual activity|checkpoint/i'],composer:['[data-handpost="composer"]','form'],text:['[data-handpost="text"]','[contenteditable="true"]','textarea'],file:['input[type="file"]','input[accept*="image"],input[accept*="video"]'],submit:['[data-handpost="submit"]','button[type="submit"]'],success:['[data-handpost="success"]','text=/posted|published|shared/i'],post:['[data-handpost="post"]','article']};
 for(const key of Object.keys(overrides) as Array<keyof AdapterConfig['selectors']>)selectors[key]=[...(overrides[key]??[]),...selectors[key]];
 return selectors;
}

export const mockSelectors=withSelectorFallbacks();
