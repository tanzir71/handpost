import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const launched = vi.hoisted(() => ({ contexts: [] as Array<EventEmitter & { closed: boolean }> }));
vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const context = Object.assign(new EventEmitter(), {
        closed: false,
        addInitScript: async () => {},
        pages: () => [],
        // Deliberately late: the close event arrives after close() resolves, like a slow browser shutdown.
        close: async () => {
          context.closed = true;
          setTimeout(() => context.emit('close'), 30);
        },
      });
      launched.contexts.push(context);
      return context;
    }),
  },
}));
import { BrowserEngine } from '../../src/main/engine/browser';

describe('browser engine contexts', () => {
  it('keeps the newer context when an older one reports close late', async () => {
    const engine = new BrowserEngine(mkdtempSync(join(tmpdir(), 'handpost-engine-')), 'chromium');
    const first = await engine.context('mock', { headless: true });
    await engine.close('mock');
    const second = await engine.context('mock', { headless: true });
    expect(second).not.toBe(first);
    await new Promise((resolve) => setTimeout(resolve, 80)); // the first context's late close event fires now
    expect(engine.activeContextCount()).toBe(1);
    expect(await engine.context('mock', { headless: true })).toBe(second);
    expect(launched.contexts).toHaveLength(2);
  });
  it('launches one context when two callers ask for the same platform at once', async () => {
    launched.contexts.length = 0;
    const engine = new BrowserEngine(mkdtempSync(join(tmpdir(), 'handpost-engine-')), 'chromium');
    const [a, b] = await Promise.all([
      engine.context('x', { headless: true }),
      engine.context('x', { headless: true }),
    ]);
    expect(a).toBe(b);
    expect(launched.contexts).toHaveLength(1);
  });
});
