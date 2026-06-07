// electron/preload.js
// Exposes a safe, minimal API to the renderer (Next.js pages).
// contextIsolation: true means renderer cannot access Node.js directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixnarr', {
  // Settings
  getSettings:      ()       => ipcRenderer.invoke('settings:get'),
  saveSettings:     (data)   => ipcRenderer.invoke('settings:save', data),
  validateSettings: ()       => ipcRenderer.invoke('settings:validate'),

  // Native dialogs
  saveFileDialog:   (opts)   => ipcRenderer.invoke('dialog:saveFile', opts),

  // Detect we're running inside Electron (useful for conditional UI)
  isElectron: true,
});
