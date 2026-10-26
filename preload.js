'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openWiki: (url) => ipcRenderer.send('open-wiki', url),
});
