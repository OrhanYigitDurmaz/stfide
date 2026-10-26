// Electron main process: window, menus, and the IPC bridge to the
// toolchain, sketch files and serial ports.

import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Toolchain } from './toolchain.js';
import { setLanguage, t } from '../common/i18n.js';
import { Monitor, listPorts } from './serial.js';
import {
  copySketch, createSketch, isValidSketchName, listExamples, loadSketch, resolveSketchDir, saveSketch, uniqueSketchDir,
} from './sketch.js';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(APP_ROOT, 'resources');
const EXAMPLES = app.isPackaged ? path.join(process.resourcesPath, 'examples') : path.join(APP_ROOT, 'examples');

protocol.registerSchemesAsPrivileged([
  { scheme: 'stfide', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let dirty = false;
let toolchain = null;
let monitor = null;
let lastPorts = '';
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

const defaultSketchbook = () => path.join(app.getPath('documents'), 'STFKart');

function sketchbookDir() {
  const custom = readSettings().sketchbook;
  return custom && path.isAbsolute(custom) ? custom : defaultSketchbook();
}

// Applies a settings change from the Settings window. A new sketchbook
// folder must be usable before it is saved.
function changeSettings(patch) {
  if (patch.sketchbook) {
    fs.mkdirSync(patch.sketchbook, { recursive: true });
    fs.accessSync(patch.sketchbook, fs.constants.W_OK);
  }
  const next = writeSettings(patch);
  if ('language' in patch) {
    setLanguage(next.language || 'en');
    buildMenu();
  }
  return next;
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function rememberSketch(sketch) {
  writeSettings({ lastSketch: sketch.dir });
  win?.setTitle(`${sketch.name} | STFIDE`);
  return sketch;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'STFIDE',
    backgroundColor: '#1e1f22',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(APP_ROOT, 'src', 'main', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('stfide://app/src/renderer/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: [t('dialog.save'), t('dialog.dontSave'), t('dialog.cancel')],
      defaultId: 0,
      cancelId: 2,
      message: t('dialog.saveBeforeClose'),
    });
    if (choice === 2) e.preventDefault();
    else if (choice === 0) {
      e.preventDefault();
      send('app:save-and-close');
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function buildMenu() {
  const menu = (action) => () => send('menu', action);
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.newSketch'), accelerator: 'CmdOrCtrl+N', click: menu('new') },
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: menu('open') },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: menu('save') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: menu('saveAs') },
        { type: 'separator' },
        { label: t('menu.newTab'), accelerator: 'CmdOrCtrl+Shift+N', click: menu('newTab') },
        { type: 'separator' },
        { label: t('menu.openSketchbook'), click: () => shell.openPath(sketchbookDir()) },
        { label: t('menu.settings'), accelerator: 'CmdOrCtrl+,', click: menu('settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: t('menu.sketch'),
      submenu: [
        { label: t('menu.verify'), accelerator: 'CmdOrCtrl+R', click: menu('verify') },
        { label: t('menu.upload'), accelerator: 'CmdOrCtrl+U', click: menu('upload') },
        { type: 'separator' },
        { label: t('menu.showCircuit'), accelerator: 'CmdOrCtrl+P', click: menu('pins') },
        { label: t('menu.showCode'), accelerator: 'CmdOrCtrl+E', click: menu('code') },
        { label: t('menu.showFolder'), click: menu('showFolder') },
      ],
    },
    {
      label: t('menu.tools'),
      submenu: [
        { label: t('menu.serialMonitor'), accelerator: 'CmdOrCtrl+Shift+M', click: menu('monitor') },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }]),
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.reference'), click: () => shell.openExternal('https://docs.arduino.cc/language-reference/') },
        { label: t('menu.about'), click: () => dialog.showMessageBox(win, { message: `STFIDE ${app.getVersion()}`, detail: t('menu.aboutDetail') }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function pollPorts() {
  try {
    const ports = await listPorts();
    const key = JSON.stringify(ports);
    if (key !== lastPorts) {
      lastPorts = key;
      send('ports:changed', ports);
    }
  } catch {
    // Port listing can fail briefly while a device is being plugged in.
  }
}

function registerIpc() {
  const handle = (ch, fn) => ipcMain.handle(ch, (_e, ...args) => fn(...args));

  handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
    sketchbook: sketchbookDir(),
    defaultSketchbook: defaultSketchbook(),
    settings: readSettings(),
  }));
  handle('app:settings', (patch) => changeSettings(patch));
  handle('app:pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, {
      defaultPath: sketchbookDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('app:set-dirty', (value) => {
    dirty = Boolean(value);
  });
  handle('app:quit', () => {
    dirty = false;
    win?.close();
  });

  handle('sketch:initial', () => {
    const last = readSettings().lastSketch;
    if (last && fs.existsSync(last)) {
      try {
        return rememberSketch(loadSketch(last));
      } catch {
        // Fall through to a fresh sketch.
      }
    }
    return rememberSketch(createSketch(sketchbookDir()));
  });
  handle('sketch:new', () => rememberSketch(createSketch(sketchbookDir())));
  handle('sketch:open', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: t('dialog.openSketch'),
      defaultPath: sketchbookDir(),
      properties: ['openFile'],
      filters: [{ name: 'Sketches', extensions: ['ino'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return rememberSketch(loadSketch(resolveSketchDir(r.filePaths[0])));
  });
  handle('sketch:save', (dir, data) => {
    saveSketch(dir, data);
    return loadSketch(dir);
  });
  handle('sketch:saveAs', async (dir, data) => {
    const r = await dialog.showSaveDialog(win, {
      title: t('dialog.saveSketchAs'),
      defaultPath: path.join(sketchbookDir(), path.basename(dir)),
      buttonLabel: 'Save',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (r.canceled || !r.filePath) return null;
    const name = path.basename(r.filePath).replace(/\.ino$/i, '');
    if (!isValidSketchName(name)) throw new Error(`"${name}" can't be used as a sketch name. Use letters, numbers, _ and -.`);
    const target = path.join(path.dirname(r.filePath), name);
    return rememberSketch(copySketch(dir, target, data));
  });
  handle('sketch:showFolder', (dir) => shell.openPath(dir));

  handle('examples:list', () => listExamples(EXAMPLES));
  handle('examples:open', (name) => {
    const src = path.join(EXAMPLES, path.basename(name));
    fs.mkdirSync(sketchbookDir(), { recursive: true });
    const sketch = copySketch(src, uniqueSketchDir(sketchbookDir(), path.basename(name)));
    // Writes the generated pin files for the example's pin setup.
    saveSketch(sketch.dir, sketch);
    return rememberSketch(loadSketch(sketch.dir));
  });

  handle('build:status', () => toolchain.status());
  handle('build:installCore', async () => {
    const r = await toolchain.installCore((text) => send('build:output', text));
    return { ok: r.code === 0 };
  });
  handle('build:cancel', () => toolchain.cancel());
  handle('build:run', async ({ dir, upload, port }) => {
    const resume = upload && monitor.isOpen && monitor.config?.path === port ? monitor.config : null;
    if (resume) {
      await monitor.close();
      send('monitor:paused');
    }
    const r = await toolchain.compile(dir, { upload, port, onOutput: (text, stream) => send('build:output', text, stream) });
    if (resume) {
      // Give the board's bootloader a moment to hand over to the sketch.
      await new Promise((res) => setTimeout(res, 400));
      try {
        await monitor.open(resume.path, resume.baudRate);
        send('monitor:resumed', resume);
      } catch {
        send('monitor:closed');
      }
    }
    return { ok: r.code === 0, output: r.stdout + r.stderr, chunks: r.chunks };
  });

  handle('ports:list', () => listPorts());
  handle('monitor:open', (portPath, baud) => monitor.open(portPath, baud));
  handle('monitor:close', () => monitor.close());
  handle('monitor:write', (text) => monitor.write(text));
}

app.whenReady().then(() => {
  protocol.handle('stfide', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(APP_ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(APP_ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  toolchain = new Toolchain({ resourcesDir: RESOURCES, userDataDir: app.getPath('userData') });
  toolchain.installBoardPlatform();
  monitor = new Monitor({
    onData: (text) => send('monitor:data', text),
    onClose: () => send('monitor:closed'),
  });

  registerIpc();
  setLanguage(readSettings().language || 'en');
  buildMenu();
  createWindow();
  setInterval(pollPorts, 1500);
  pollPorts();
});

app.on('window-all-closed', () => {
  monitor?.close();
  app.quit();
});
