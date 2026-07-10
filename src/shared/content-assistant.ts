export interface ContentAssistantRequest{prompt:string;platforms:string[];}
export interface ContentAssistantSuggestion{text:string;}

/** Reserved extension point. Relay intentionally ships without an AI implementation. */
export interface ContentAssistant{suggest(request:ContentAssistantRequest):Promise<ContentAssistantSuggestion[]>;}
