export function sanitizeDom(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\b[^>]*(?:csrf|token|cookie|authorization)[^>]*>/gi, '')
    .replace(/\s(?:value|data-token|nonce|integrity)=(['"])[\s\S]*?\1/gi, '')
    .replace(/(bearer|token|session|cookie)\s*[:=]\s*[^\s<'"]+/gi, '$1=[REDACTED]');
}

/** Longest run of page text kept verbatim in a repair snapshot (button labels, headings, field names). */
export const REPAIR_TEXT_LIMIT = 40;
/** Longest attribute value kept verbatim (long aria-labels and titles are usually post text or names). */
export const REPAIR_ATTRIBUTE_LIMIT = 80;

/**
 * A page snapshot for fixing selectors (docs/SELECTORS.md): the structure, attributes and short labels a selector
 * needs, without what makes up most of a logged-in page's personal content. On top of `sanitizeDom` it drops
 * styles, SVG path data, inline styles and `srcset`, cuts query strings and fragments from links, replaces data:
 * URIs, and replaces longer text runs and long attribute values with a length marker.
 */
export function sanitizeForRepair(html: string): string {
  return sanitizeDom(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/\s(?:d|style|srcset|points)=(['"])[\s\S]*?\1/gi, '')
    .replace(/\s(href|src|action|poster)=(['"])data:[^'"]*\2/gi, ' $1=$2data:[removed]$2')
    .replace(/\s(href|src|action|poster)=(['"])([^'"?#]*)[?#][^'"]*\2/gi, ' $1=$2$3$2')
    .replace(
      /\s([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g,
      (match, name: string, double?: string, single?: string) => {
        const value = double ?? single ?? '';
        return value.length > REPAIR_ATTRIBUTE_LIMIT && !/^(?:href|src|action|class|id)$/i.test(name)
          ? ` ${name}="[${value.length} chars]"`
          : match;
      },
    )
    .replace(/>([^<]+)</g, (match, text: string) => {
      const trimmed = text.trim();
      return trimmed.length > REPAIR_TEXT_LIMIT ? `>[text, ${trimmed.length} chars]<` : match;
    });
}
