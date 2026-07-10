export interface ContentAssistant{generate(prompt:string):Promise<string>;}
export const contentAssistant:ContentAssistant|null=null;
