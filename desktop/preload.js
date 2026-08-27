'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Android', {
  printPdf: () => ipcRenderer.send('print-pdf'),
  notifyCmems: (state, text) => ipcRenderer.send('notify-model', 'cmems', String(state || ''), String(text || '')),
  notifyVessel: (state, text) => ipcRenderer.send('notify-model', 'vessel', String(state || ''), String(text || '')),
  setClipboardText: text => ipcRenderer.sendSync('clipboard-write', String(text || '')),
  getClipboardText: () => ipcRenderer.sendSync('clipboard-read'),
  getGithubToken: () => ipcRenderer.sendSync('token-get'),
  saveGithubToken: token => ipcRenderer.send('token-save', String(token || '')),
  clearGithubToken: () => ipcRenderer.send('token-clear'),
  saveText: (filename, text) => ipcRenderer.send('save-text', { filename:String(filename || ''), text:String(text || '') }),
  saveBase64: (filename, mime, data) => ipcRenderer.send('save-base64', { filename:String(filename || ''), mime:String(mime || ''), data:String(data || '') }),
  getNotificationStatus: () => ipcRenderer.sendSync('notification-status'),
  sendTestNotification: () => ipcRenderer.send('test-notification'),
  openNotificationSettings: () => ipcRenderer.send('open-notification-settings')
});
