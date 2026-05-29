const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('set-settings', partial),
  skipBreak: () => ipcRenderer.invoke('skip-break'),
  triggerBreakNow: () => ipcRenderer.invoke('trigger-break-now'),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  pickFile: (filters) => ipcRenderer.invoke('pick-file', filters),
  revealFile: (p) => ipcRenderer.invoke('reveal-file', p),
  getState: () => ipcRenderer.invoke('get-state'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  overlayReady: () => ipcRenderer.send('overlay-ready'),
  moveMiniBarCorner: (corner) => ipcRenderer.invoke('move-mini-bar-corner', corner),
  getVersion: () => ipcRenderer.invoke('get-version'),
  onTick: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('tick', listener);
    return () => ipcRenderer.removeListener('tick', listener);
  },
});
