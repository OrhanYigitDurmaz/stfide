// Exposes a small, explicit API to the renderer. The renderer has no Node
// access; everything goes through these calls.

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (fn) => {
  const listener = (_e, ...args) => fn(...args);
  ipcRenderer.on(ch, listener);
  return () => ipcRenderer.removeListener(ch, listener);
};

contextBridge.exposeInMainWorld('stfide', {
  app: {
    info: invoke('app:info'),
    settings: invoke('app:settings'),
    pickFolder: invoke('app:pick-folder'),
    setDirty: invoke('app:set-dirty'),
    quit: invoke('app:quit'),
    onSaveAndClose: on('app:save-and-close'),
    onMenu: on('menu'),
  },
  sketch: {
    initial: invoke('sketch:initial'),
    create: invoke('sketch:new'),
    open: invoke('sketch:open'),
    save: invoke('sketch:save'),
    saveAs: invoke('sketch:saveAs'),
    showFolder: invoke('sketch:showFolder'),
  },
  examples: {
    list: invoke('examples:list'),
    open: invoke('examples:open'),
  },
  build: {
    status: invoke('build:status'),
    installCore: invoke('build:installCore'),
    run: invoke('build:run'),
    cancel: invoke('build:cancel'),
    onOutput: on('build:output'),
  },
  ports: {
    list: invoke('ports:list'),
    onChanged: on('ports:changed'),
  },
  monitor: {
    open: invoke('monitor:open'),
    close: invoke('monitor:close'),
    write: invoke('monitor:write'),
    onData: on('monitor:data'),
    onClosed: on('monitor:closed'),
    onPaused: on('monitor:paused'),
    onResumed: on('monitor:resumed'),
  },
});
