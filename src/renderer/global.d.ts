import type { HandpostApi } from '../shared/api';
declare global {
  interface Window {
    handpost: HandpostApi;
  }
}
export {};
