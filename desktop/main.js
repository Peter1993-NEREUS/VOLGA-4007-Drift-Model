'use strict';

const { app, BrowserWindow, ipcMain, dialog, Notification, shell, clipboard, safeStorage } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_ID = 'com.nereus.marinedrift';
const PRODUCT = 'Marine Drift Model by NEREUS';
const VERSION = '1.7.0';
const ASSET_DIR = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const ENHANCEMENTS = ['v141.js','v150.js','v151.js','v152.js','v160.js','v161.js','v162.js','v163.js','v164.js','v165.js','v166.js','v167.js','v168.js','v169.js','v170.js','v171.js'];

let mainWindow = null;
let assetServer = null;
let assetOrigin = null;

app.setName(PRODUCT);
app.setAppUserModelId(APP_ID);

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html':'text/html; charset=utf-8',
    '.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.json':'application/json; charset=utf-8',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.svg':'image/svg+xml',
    '.bin':'application/octet-stream',
    '.ico':'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function startAssetServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        let rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname).replace(/^\/+/, '');
        const target = path.resolve(ASSET_DIR, rel);
        if (target !== ASSET_DIR && !target.startsWith(ASSET_DIR + path.sep)) {
          res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'}); res.end('Forbidden'); return;
        }
        fs.stat(target, (err, st) => {
          if (err || !st.isFile()) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('Not found'); return; }
          res.writeHead(200, {
            'Content-Type': mime(target),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
          });
          fs.createReadStream(target).pipe(res);
        });
      } catch (e) {
        res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'}); res.end('Asset server error');
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      assetServer = server;
      assetOrigin = `http://127.0.0.1:${a.port}`;
      resolve(assetOrigin);
    });
  });
}

function settingsPath() { return path.join(app.getPath('userData'), 'desktop-settings.json'); }
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (_) { return {}; }
}
function writeSettings(obj) {
  try { fs.mkdirSync(path.dirname(settingsPath()), {recursive:true}); fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2), 'utf8'); } catch (_) {}
}
function saveToken(raw) {
  const token = String(raw || '').trim();
  const s = readSettings();
  delete s.githubTokenPlain; delete s.githubTokenEncrypted;
  if (token) {
    try {
      if (safeStorage.isEncryptionAvailable()) s.githubTokenEncrypted = safeStorage.encryptString(token).toString('base64');
      else s.githubTokenPlain = token;
    } catch (_) { s.githubTokenPlain = token; }
  }
  writeSettings(s);
}
function getToken() {
  const s = readSettings();
  try {
    if (s.githubTokenEncrypted && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(s.githubTokenEncrypted, 'base64'));
  } catch (_) {}
  return String(s.githubTokenPlain || '');
}

function safeName(name, fallback) {
  const n = String(name || fallback || 'export').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n || fallback || 'export';
}

async function saveBuffer(filename, buffer, filters) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save export',
    defaultPath: safeName(filename, 'export'),
    filters: filters || [{name:'All files',extensions:['*']}]
  });
  if (!result.canceled && result.filePath) await fs.promises.writeFile(result.filePath, buffer);
}

function notificationStatus() {
  return Notification.isSupported() ? 'allowed' : 'unsupported';
}
function showNotification(kind, state, text) {
  if (!Notification.isSupported()) return;
  const st = String(state || 'progress').toLowerCase();
  let title;
  if (kind === 'vessel') title = st === 'success' ? 'Vessel data ready' : st === 'error' ? 'Vessel lookup failed' : 'Vessel lookup';
  else title = st === 'success' ? 'CMEMS data ready' : st === 'error' ? 'CMEMS update failed' : 'CMEMS data update';
  const n = new Notification({ title, body:String(text || title), silent:st !== 'error' });
  n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  n.show();
}

async function injectEnhancements() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const js = `(function(){var a=${JSON.stringify(ENHANCEMENTS)};function n(i){if(i>=a.length)return;var id='enh'+i;if(document.getElementById(id)){n(i+1);return;}var s=document.createElement('script');s.id=id;s.src=a[i];s.onload=function(){n(i+1)};s.onerror=function(){console.error('Failed to load '+a[i]);n(i+1)};document.body.appendChild(s);}n(0);})();`;
  await mainWindow.webContents.executeJavaScript(js, true);
}

async function printPdf() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const job = await mainWindow.webContents.executeJavaScript("(window.nereusPrintJobName?window.nereusPrintJobName():'Marine Drift Model by NEREUS')", true);
    await mainWindow.webContents.executeJavaScript("document.body.classList.add('pdfExport');window.scrollTo(0,0);", true);
    await new Promise(r => setTimeout(r, 220));
    const data = await mainWindow.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});
    await saveBuffer(`${safeName(job,'Marine Drift Model')}.pdf`, data, [{name:'PDF',extensions:['pdf']}]);
  } catch (e) {
    console.error('PDF export failed', e);
  } finally {
    try { await mainWindow.webContents.executeJavaScript("document.body.classList.remove('pdfExport');", true); } catch (_) {}
  }
}

function wireIpc() {
  ipcMain.on('clipboard-write', (e, text) => { clipboard.writeText(String(text || '')); e.returnValue = true; });
  ipcMain.on('clipboard-read', e => { e.returnValue = clipboard.readText(); });
  ipcMain.on('token-get', e => { e.returnValue = getToken(); });
  ipcMain.on('token-save', (_e, token) => saveToken(token));
  ipcMain.on('token-clear', () => saveToken(''));
  ipcMain.on('notification-status', e => { e.returnValue = notificationStatus(); });
  ipcMain.on('notify-model', (_e, kind, state, text) => showNotification(kind, state, text));
  ipcMain.on('test-notification', () => {
    if (Notification.isSupported()) new Notification({title:'Marine Drift Model • test notification',body:'Windows notification bridge is working.'}).show();
  });
  ipcMain.on('open-notification-settings', () => shell.openExternal('ms-settings:notifications').catch(()=>{}));
  ipcMain.on('save-text', (_e, p) => {
    const name = safeName(p?.filename, 'Marine-Drift-Model.csv');
    saveBuffer(name, Buffer.from(String(p?.text || ''), 'utf8'), [{name:'CSV / text',extensions:['csv','txt']}]).catch(console.error);
  });
  ipcMain.on('save-base64', (_e, p) => {
    try {
      const raw = String(p?.data || '');
      const body = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
      const ext = String(p?.mime || '').includes('png') ? 'png' : 'bin';
      saveBuffer(safeName(p?.filename, `export.${ext}`), Buffer.from(body, 'base64'), [{name:ext.toUpperCase(),extensions:[ext]}]).catch(console.error);
    } catch (e) { console.error('Base64 export failed', e); }
  });
  ipcMain.on('print-pdf', () => printPdf());
}

async function createWindow() {
  if (!assetOrigin) await startAssetServer();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 860,
    minHeight: 620,
    show: false,
    backgroundColor: '#06243a',
    autoHideMenuBar: true,
    title: `${PRODUCT} v${VERSION}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/i.test(url)) shell.openExternal(url).catch(()=>{}); return {action:'deny'}; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(assetOrigin + '/')) { event.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url).catch(()=>{}); }
  });
  mainWindow.webContents.on('did-finish-load', () => injectEnhancements().catch(console.error));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(`${assetOrigin}/index.html`);
}

app.whenReady().then(async () => {
  wireIpc();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error); });
}).catch(console.error);

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { try { assetServer?.close(); } catch (_) {} });
