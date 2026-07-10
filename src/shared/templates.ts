export function templateVariables(body:string):string[]{return [...new Set([...body.matchAll(/\{([a-zA-Z][\w-]*)\}/g)].map(match=>match[1]!))];}
export function renderTemplate(body:string,values:Record<string,string>):string{return body.replace(/\{([a-zA-Z][\w-]*)\}/g,(_match,key:string)=>values[key]??`{${key}}`);}
