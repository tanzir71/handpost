import type { HandpostApi } from '../../shared/api';
import { createDemoApi } from './demo';

/** The preload bridge in Electron; an in-memory demo when the renderer runs in a plain browser. */
export const handpostApi: HandpostApi = window.handpost ?? createDemoApi();
export const isDemo = !window.handpost;
