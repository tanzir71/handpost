import type { HandpostApi, HandpostSnapshot } from '../../shared/api';
const empty: HandpostSnapshot = {
  accounts: [],
  posts: [],
  targets: [],
  media: [],
  attempts: [],
  slots: [],
  templates: [],
  settings: [],
};
const demo: HandpostApi = {
  snapshot: async () => empty,
  savePost: async () => 1,
  queuePost: async () => 1,
  reschedule: async () => {},
  retry: async () => {},
  connect: async () => {},
  reenable: async () => {},
  attachMedia: async () => [],
  addMedia: async () => [],
  updateMediaAlt: async () => {},
  saveTemplate: async () => 1,
  saveSetting: async () => {},
  saveAccountSettings: async () => {},
  csvImport: async () => [],
  exportData: async () => '',
  importData: async () => {},
  openManual: async () => {},
  openExternal: async () => {},
  readArtifact: async () => '',
};
export const handpostApi: HandpostApi = window.handpost ?? demo;
