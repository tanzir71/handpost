import { contextBridge, ipcRenderer } from 'electron';
import type { HandpostApi } from '../shared/api';
const api: HandpostApi = {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  savePost: (v) => ipcRenderer.invoke('save-post', v),
  queuePost: (v) => ipcRenderer.invoke('queue-post', v),
  reschedule: (v) => ipcRenderer.invoke('reschedule', v),
  retry: (v) => ipcRenderer.invoke('retry', v),
  connect: (v) => ipcRenderer.invoke('connect', v),
  reenable: (v) => ipcRenderer.invoke('reenable', v),
  attachMedia: (id) => ipcRenderer.invoke('attach-media', id),
  addMedia: (v) => ipcRenderer.invoke('add-media', v),
  updateMediaAlt: (v) => ipcRenderer.invoke('update-media-alt', v),
  saveTemplate: (v) => ipcRenderer.invoke('save-template', v),
  saveSetting: (v) => ipcRenderer.invoke('save-setting', v),
  saveAccountSettings: (v) => ipcRenderer.invoke('save-account-settings', v),
  csvImport: (v) => ipcRenderer.invoke('csv-import', v),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  openManual: (id) => ipcRenderer.invoke('open-manual', id),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readArtifact: (path) => ipcRenderer.invoke('read-artifact', path),
};
contextBridge.exposeInMainWorld('handpost', api);
