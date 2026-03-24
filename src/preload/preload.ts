import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  openSettings: () => ipcRenderer.send('open-settings'),
  closeWindow: () => ipcRenderer.send('close-window')
});
