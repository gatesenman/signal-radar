const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { call: (ch, ...a) => ipcRenderer.invoke(ch, ...a), on: (ch, f) => { const h = (_, d) => f(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); } });
