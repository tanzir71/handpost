export function sanitizeDom(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\b[^>]*(?:csrf|token|cookie|authorization)[^>]*>/gi, '')
    .replace(/\s(?:value|data-token|nonce|integrity)=(['"])[\s\S]*?\1/gi, '')
    .replace(/(bearer|token|session|cookie)\s*[:=]\s*[^\s<'"]+/gi, '$1=[REDACTED]');
}
