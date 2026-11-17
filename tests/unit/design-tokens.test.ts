import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensPath = join(process.cwd(), 'src', 'renderer', 'styles', 'tokens.css');
const css = readFileSync(tokensPath, 'utf8');

function block(selector: RegExp): Record<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error(`No block for ${selector}`);
  const body = css.slice(match.index + match[0].length, css.indexOf('}', match.index + match[0].length));
  return Object.fromEntries(
    [...body.matchAll(/--hp-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
  );
}

const light = block(/:root,\s*\[data-theme='light'\]\s*\{/);
const dark = block(/\n\[data-theme='dark'\]\s*\{/);
const systemDark = block(/:root:not\(\[data-theme='light'\]\)\s*\{/);
const shared = block(/\n:root\s*\{/);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text token, background token, minimum ratio] — every pairing docs/DESIGN.md and the components use. */
const PAIRS: Array<[string, string, number]> = [
  ...['bg-canvas', 'bg-surface', 'bg-sunken', 'bg-sidebar'].flatMap((bg): Array<[string, string, number]> => [
    ['text-primary', bg, 4.5],
    ['text-secondary', bg, 4.5],
    ['text-muted', bg, 4.5],
    ['accent-ink', bg, 4.5],
    ['brand-red', bg, 4.5],
    ['status-ok', bg === 'bg-sunken' ? 'bg-surface' : bg, 4.5],
    ['status-warn', bg === 'bg-sunken' ? 'bg-surface' : bg, 4.5],
    ['status-danger', bg === 'bg-sunken' ? 'bg-surface' : bg, 4.5],
  ]),
  ['text-muted', 'bg-sunken', 4.6],
  ['accent-on-ink', 'accent-ink', 4.5],
  ['accent-ink', 'accent-ink-soft', 4.5],
  ['text-primary', 'accent-ink-soft', 4.5],
  ['text-inverse', 'bg-inverse', 4.5],
  ['brand-red', 'brand-red-soft', 4.5],
  ['text-primary', 'brand-red-soft', 4.5],
  ['status-ok', 'status-ok-soft', 4.5],
  ['status-warn', 'status-warn-soft', 4.5],
  ['status-danger', 'status-danger-soft', 4.5],
  ['accent-on-ink', 'brand-red', 3], // stamp "h" and the coffee button label (large/bold)
  ['text-primary', 'bg-canvas', 3], // Display text (large)
];

describe('design tokens', () => {
  it('define the same names in light and dark, and the system-dark block mirrors dark', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(systemDark).toEqual(dark);
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(23);
  });
  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`meet WCAG contrast for every text/background pair in ${name}`, () => {
      const failures = PAIRS.map(([fg, bg, min]) => ({
        fg,
        bg,
        min,
        ratio: contrast(theme[fg]!, theme[bg]!),
      }))
        .filter((pair) => !(pair.ratio >= pair.min))
        .map((pair) => `${pair.fg} on ${pair.bg}: ${pair.ratio.toFixed(2)} < ${pair.min}`);
      expect(failures).toEqual([]);
    });
  }
  it('keeps white monograms readable on every platform badge hue', () => {
    const hues = Object.entries(shared).filter(
      ([key]) => key.startsWith('platform-') && key !== 'platform-on',
    );
    expect(hues.length).toBe(10);
    for (const [key, hex] of hues)
      expect(contrast(shared['platform-on']!, hex), key).toBeGreaterThanOrEqual(4.5);
  });
});

describe('renderer colours', () => {
  it('contain no hard-coded hex colours outside tokens.css', () => {
    const root = join(process.cwd(), 'src', 'renderer');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(css|tsx?|html)$/.test(name) && path !== tokensPath) {
          const text = readFileSync(path, 'utf8');
          for (const match of text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/g))
            offenders.push(`${relative(root, path)}: ${match[0]}`);
          for (const match of text.matchAll(/\brgba?\(\s*\d/g))
            offenders.push(`${relative(root, path)}: ${match[0]}`);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
