import { adapterConfigs } from './configs';
import { createAdapter } from './factory';
import { applyPatch } from './slots';
import type { AdapterConfig, PlatformAdapter } from './types';
import type { PlatformId } from '../../shared/types';
import type { SelectorPatch } from '../../shared/selectors';

const base = new Map(adapterConfigs.map((config) => [config.id, config]));
let patches = new Map<PlatformId, SelectorPatch>();
const cache = new Map<PlatformId, PlatformAdapter>();

/** Installs the owner's applied selector fixes (Accounts → Selectors); adapters are rebuilt on next use. */
export function setSelectorPatches(next: Map<PlatformId, SelectorPatch>): void {
  patches = new Map(next);
  cache.clear();
}

/** The adapter config in effect: built-in selectors plus the applied fix, if any. */
export function adapterConfig(id: PlatformId): AdapterConfig {
  const config = base.get(id);
  if (!config) throw new Error(`No adapter for ${id}`);
  return applyPatch(config, patches.get(id));
}

/**
 * The adapter for a platform. `trial` layers a not-yet-applied fix on top (Rehearse with a proposed fix); such
 * adapters are built fresh and never cached.
 */
export function getAdapter(id: PlatformId, trial?: SelectorPatch): PlatformAdapter {
  if (trial) return createAdapter(applyPatch(adapterConfig(id), trial));
  let adapter = cache.get(id);
  if (!adapter) {
    adapter = createAdapter(adapterConfig(id));
    cache.set(id, adapter);
  }
  return adapter;
}
