import { adapterConfigs } from './configs';
import { createAdapter } from './factory';
import type { PlatformId } from '../../shared/types';
export const adapters = new Map(adapterConfigs.map((config) => [config.id, createAdapter(config)]));
export function getAdapter(id: PlatformId) {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`No adapter for ${id}`);
  return adapter;
}
