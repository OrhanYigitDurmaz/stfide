// Renderer entry point: wires the toolbar, editor, Circuit tab, output panel
// and serial monitor together.

import { BOARD } from '../common/board.js';
import { LANGUAGE_NAMES, getLanguage, setLanguage, t } from '../common/i18n.js';
import { GENERATED_FILES, BAUD_RATES, emptyConfig, generate, hasErrors, validate } from '../common/pins.js';
import { friendlyHints, parseDiagnostics, parseSize } from '../common/diagnostics.js';
import { DEFAULT_FONT_SIZE, Editor, FONT_SIZES, loadMonaco } from './editor.js';
import { PinsView } from './pins-view.js';

const api = window.stfide;
const $ = (sel) => document.querySelector(sel);

const ICONS = {
  verify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  new: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h8l4 4v14H6z"/><path d="M12 10v7M8.5 13.5h7"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h6l2 2h10v11H3z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

const state = {
  info: null,
  sketch: null, // { dir, name, main }
  files: [], // [{ name, generated, dirty }]
  config: emptyConfig(),
  configDirty: false,
  active: null,
  view: 'code',
  ports: [],
  port: null,
  building: false,
  streamed: 0, // build output chunks shown so far
  monitorOpen: false,
};

let editor;
let pinsView;

// ---------------------------------------------------------------------------
// startup

async function init() {
  state.info = await api.app.info();
  setLanguage(state.info.settings.language || 'en');
  applyI18n();
  for (const [id, key] of [['btn-verify', 'verify'], ['btn-upload', 'upload'], ['btn-new', 'new'], ['btn-open', 'open'], ['btn-save', 'save'], ['btn-monitor', 'monitor'], ['btn-settings', 'settings']]) {
    $(`#${id}`).innerHTML = ICONS[key];
  }

  await loadMonaco();
  editor = new Editor($('#editor'), {
    fontSize: state.info.settings.fontSize || DEFAULT_FONT_SIZE,
    onChange: (name) => {
      const f = state.files.find((x) => x.name === name);
      if (f && !f.generated && !f.dirty) {
        f.dirty = true;
        renderTabs();
        syncDirty();
      }
    },
    onCursor: (pos) => {
      $('#status-pos').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    },
  });

  pinsView = new PinsView($('#pins-view'), {
    getConfig: () => state.config,
    setConfig,
    getSources: () => state.files.filter((f) => !f.generated).map((f) => editor.getContent(f.name)),
    onInsertHandler: (fn) => {
      showView('code');
      editor.insertAtEnd(state.sketch.main, `\n// Runs when the interrupt pin triggers. Keep it short.\nvoid ${fn}() {\n  \n}\n`);
    },
  });

  bindToolbar();
  bindPanel();
  bindMonitor();
  bindMenu();
  await setupExamples();
  await refreshPorts(await api.ports.list());
  api.ports.onChanged(refreshPorts);
  api.build.onOutput((text, stream) => {
    if (!state.building) return;
    state.streamed += 1;
    appendOutput(text, stream === 'stderr' ? 'stderr' : '');
  });
  api.app.onSaveAndClose(async () => {
    if (await save()) api.app.quit();
  });

  openSketch(await api.sketch.initial());
  checkToolchain();
}

function applyI18n() {
  for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
  for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
}

async function checkToolchain() {
  const status = await api.build.status();
  if (!status.cli) {
    appendOutput(`${t('build.noCli')}\n`, 'err');
  } else if (!status.core) {
    appendOutput(`${t('build.noCore')}\n`, 'info');
    const btn = document.createElement('button');
    btn.className = 'text';
    btn.textContent = t('build.installCore');
    btn.style.border = '1px solid var(--accent)';
    btn.onclick = async () => {
      btn.disabled = true;
      appendOutput(`${t('build.installingCore')}\n`, 'info');
      state.building = true;
      const r = await api.build.installCore();
      state.building = false;
      appendOutput(r.ok ? 'OK\n' : 'Failed\n', r.ok ? 'ok' : 'err');
    };
    $('#output').append(btn, '\n');
  }
}

// ---------------------------------------------------------------------------
// sketch

function openSketch(sketch) {
  if (!sketch) return;
  state.sketch = { dir: sketch.dir, name: sketch.name, main: sketch.main };
  state.config = sketch.config;
  state.configDirty = false;
  const userFiles = sketch.files.filter((f) => !GENERATED_FILES.includes(f.name));
  const generated = generate(state.config);
  state.files = [
    ...userFiles.map((f) => ({ name: f.name, generated: false, dirty: false })),
    ...GENERATED_FILES.map((name) => ({ name, generated: true, dirty: false })),
  ];
  editor.setFiles([
    ...userFiles,
    ...GENERATED_FILES.map((name) => ({ name, content: generated[name] })),
  ]);
  editor.setConfig(state.config);
  editor.setDiagnostics([]);
  state.active = sketch.main;
  renderTabs();
  editor.show(sketch.main);
  pinsView.reset();
  syncDirty();
  document.title = `${sketch.name} | STFIDE`;
  status('');
}

function setConfig(cfg) {
  state.config = cfg;
  state.configDirty = true;
  editor.setConfig(cfg);
  const generated = generate(cfg);
  for (const name of GENERATED_FILES) editor.replaceContent(name, generated[name]);
  syncDirty();
  renderTabs();
}

function isDirty() {
  return state.configDirty || state.files.some((f) => f.dirty);
}

function syncDirty() {
  api.app.setDirty(isDirty());
  $('#tab-pins').textContent = t('view.pins') + (state.configDirty ? ' •' : '');
}

function sketchData() {
  return {
    files: state.files.filter((f) => !f.generated).map((f) => ({ name: f.name, content: editor.getContent(f.name) })),
    config: state.config,
  };
}

function markSaved() {
  for (const f of state.files) f.dirty = false;
  state.configDirty = false;
  renderTabs();
  syncDirty();
}

async function save() {
  try {
    await api.sketch.save(state.sketch.dir, sketchData());
    markSaved();
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

async function saveAs() {
  try {
    const sketch = await api.sketch.saveAs(state.sketch.dir, sketchData());
    if (sketch) openSketch(sketch);
  } catch (err) {
    showError(err);
  }
}

// Runs `fn` only after the user agrees to drop or save unsaved changes.
async function confirmDiscard() {
  if (!isDirty()) return true;
  const choice = await modal({
    message: t('dialog.saveFirst'),
    buttons: [['cancel', t('dialog.cancel')], ['discard', t('dialog.dontSave')], ['save', t('dialog.save')]],
  });
  if (choice === 'save') return save();
  return choice === 'discard';
}

async function newTab() {
  const name = await modal({
    message: t('dialog.newTab'),
    input: '',
    buttons: [['cancel', t('dialog.cancel')], ['ok', t('dialog.create')]],
    validate: (v) => {
      const n = normalizeTabName(v);
      if (!/^[A-Za-z_][A-Za-z0-9_]*\.(ino|h|cpp|c)$/.test(n)) return t('dialog.badTabName');
      if (state.files.some((f) => f.name.toLowerCase() === n.toLowerCase())) return t('dialog.tabExists');
      return '';
    },
  });
  if (!name) return;
  const file = normalizeTabName(name);
  // Only the main sketch gets the pin header automatically; other C/C++ files include it themselves.
  const content = file.endsWith('.h') ? '#pragma once\n\n#include "stfkart_pins.h"\n\n'
    : file.endsWith('.ino') ? '' : '#include "stfkart_pins.h"\n\n';
  state.files.splice(state.files.findIndex((f) => f.generated), 0, { name: file, generated: false, dirty: true });
  editor.addFile({ name: file, content });
  showFile(file);
  syncDirty();
}

function normalizeTabName(v) {
  const s = v.trim();
  return /\.\w+$/.test(s) ? s : `${s}.ino`;
}

// ---------------------------------------------------------------------------
// tabs and views

function renderTabs() {
  const bar = $('#file-tabs');
  bar.replaceChildren();
  // Generated pin files are not tabs; they are shown on the Circuit tab.
  for (const f of state.files.filter((x) => !x.generated)) {
    const b = document.createElement('button');
    b.className = `tab${f.name === state.active ? ' active' : ''}`;
    b.textContent = f.name;
    if (f.dirty) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      b.append(dot);
    }
    b.onclick = () => showFile(f.name);
    bar.append(b);
  }
  const add = document.createElement('button');
  add.className = 'add';
  add.textContent = '+';
  add.title = t('tabs.new');
  add.onclick = newTab;
  bar.append(add);
}

function showFile(name) {
  const f = state.files.find((x) => x.name === name);
  if (!f) return;
  state.active = name;
  renderTabs();
  editor.show(name, f.generated);
}

function showView(view) {
  state.view = view;
  $('#code-view').hidden = view !== 'code';
  $('#pins-view').hidden = view !== 'pins';
  $('#tab-code').classList.toggle('active', view === 'code');
  $('#tab-pins').classList.toggle('active', view === 'pins');
  if (view === 'pins') pinsView.render();
  else showFile(state.active);
}

// ---------------------------------------------------------------------------
// build

async function build(upload) {
  if (state.building) return;
  const issues = validate(state.config);
  clearOutput();
  showPanel('output');
  if (hasErrors(issues)) {
    appendOutput(`${t('build.fixPins')}\n`, 'err');
    for (const i of issues.filter((x) => x.level === 'error')) appendOutput(`  • ${i.message}\n`, 'stderr');
    showView('pins');
    status(t('build.fixPins'), 'error');
    return;
  }
  if (upload && !state.port) {
    appendOutput(`${t('build.noPort')}\n`, 'err');
    status(t('build.noPort'), 'error');
    return;
  }
  if (!(await save())) return;

  state.building = true;
  const btn = upload ? $('#btn-upload') : $('#btn-verify');
  btn.classList.add('busy');
  $('#btn-verify').disabled = true;
  $('#btn-upload').disabled = true;
  const msg = upload ? t('build.uploading', { sketch: state.sketch.name, port: state.port }) : t('build.compiling', { sketch: state.sketch.name });
  status(msg);
  appendOutput(`${msg}\n`, 'info');

  state.streamed = 0;
  try {
    const r = await api.build.run({ dir: state.sketch.dir, upload, port: state.port });
    // Output events can arrive after the result; print whatever was missed.
    for (const c of r.chunks.slice(state.streamed)) appendOutput(c.text, c.stream === 'stderr' ? 'stderr' : '');
    state.building = false;
    const diagnostics = parseDiagnostics(r.output).filter((d) => state.files.some((f) => f.name === d.file));
    editor.setDiagnostics(diagnostics);
    showProblems(diagnostics, friendlyHints(r.output, state.info.platform));
    const size = parseSize(r.output);
    if (size) $('#status-size').textContent = `Flash ${size.flashPct}% · RAM ${size.ramPct}%`;
    if (r.ok) {
      const done = upload ? t('build.uploaded') : t('build.done');
      appendOutput(`${done}\n`, 'ok');
      status(done, 'ok');
    } else {
      const failed = upload && diagnostics.length === 0 ? t('build.uploadFailed') : t('build.failed');
      appendOutput(`${failed}\n`, 'err');
      status(failed, 'error');
      if (diagnostics[0]) {
        const d = diagnostics[0];
        showView('code');
        revealDiagnostic(d);
      }
    }
  } catch (err) {
    showError(err);
  } finally {
    state.building = false;
    btn.classList.remove('busy');
    $('#btn-verify').disabled = false;
    $('#btn-upload').disabled = false;
  }
}

function revealDiagnostic(d) {
  const f = state.files.find((x) => x.name === d.file);
  state.active = d.file;
  renderTabs();
  editor.reveal(d.file, d.line, d.column, f?.generated);
}

function showProblems(diagnostics, hints) {
  const out = $('#output');
  for (const hint of hints) {
    const s = document.createElement('span');
    s.className = 'hint';
    s.textContent = `💡 ${hint}`;
    out.append(s);
  }
  const errors = diagnostics.filter((d) => d.severity === 'error');
  for (const d of errors.slice(0, 20)) {
    const a = document.createElement('a');
    a.className = 'loc';
    a.textContent = `${d.file}:${d.line}`;
    a.onclick = () => {
      showView('code');
      revealDiagnostic(d);
    };
    out.append(a, ` ${d.message}\n`);
  }
  out.scrollTop = out.scrollHeight;
}

// ---------------------------------------------------------------------------
// output panel

// arduino-cli warns about package/library indexes it can't refresh while
// offline. The bundled copies are enough, so these lines are just noise.
const OUTPUT_NOISE = /^(Downloading index: .*|Error initializing instance: (Error downloading index|Loading index file).*)\r?\n?/gm;

function appendOutput(text, cls = '') {
  text = text.replace(OUTPUT_NOISE, '');
  if (!text) return;
  const out = $('#output');
  const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 30;
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  out.append(span);
  if (atBottom) out.scrollTop = out.scrollHeight;
}

function clearOutput() {
  $('#output').replaceChildren();
}

function showPanel(which) {
  $('#ptab-output').classList.toggle('active', which === 'output');
  $('#ptab-monitor').classList.toggle('active', which === 'monitor');
  $('#output').hidden = which !== 'output';
  $('#monitor').hidden = which !== 'monitor';
  $('#monitor-controls').hidden = which !== 'monitor';
  $('#btn-monitor').classList.toggle('active', which === 'monitor');
  if (which === 'monitor') $('#monitor-input').focus();
}

function bindPanel() {
  $('#ptab-output').onclick = () => showPanel('output');
  $('#ptab-monitor').onclick = () => showPanel('monitor');
  $('#panel-clear').onclick = () => {
    if ($('#monitor').hidden) clearOutput();
    else $('#monitor-log').replaceChildren();
  };

  const saved = Number(state.info.settings.panelHeight);
  if (saved) document.documentElement.style.setProperty('--panel-height', `${saved}px`);
  const splitter = $('#splitter');
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('dragging');
    const move = (ev) => {
      const height = Math.min(window.innerHeight - 200, Math.max(80, window.innerHeight - ev.clientY - 24));
      document.documentElement.style.setProperty('--panel-height', `${height}px`);
    };
    const up = () => {
      splitter.classList.remove('dragging');
      splitter.removeEventListener('pointermove', move);
      const h = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-height'), 10);
      api.app.settings({ panelHeight: h });
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up, { once: true });
  });
}

// ---------------------------------------------------------------------------
// ports and serial monitor

async function refreshPorts(ports) {
  state.ports = ports;
  const select = $('#port-select');
  const preferred = state.port ?? state.info.settings.port;
  select.replaceChildren();
  if (!ports.length) {
    select.append(new Option(t('toolbar.noPort'), ''));
    state.port = null;
  } else {
    for (const p of ports) select.append(new Option(p.label, p.path));
    const keep = ports.find((p) => p.path === preferred) ?? ports.find((p) => p.likelyBoard) ?? ports[0];
    state.port = keep.path;
    select.value = keep.path;
  }
  renderBoardStatus();
}

function bindMonitor() {
  const baud = $('#mon-baud');
  for (const b of BAUD_RATES) baud.append(new Option(t('monitor.baud', { baud: b }), b));
  baud.value = state.info.settings.baud || 9600;
  const ending = $('#mon-ending');
  for (const [v, k] of [['', 'none'], ['\n', 'nl'], ['\r', 'cr'], ['\r\n', 'both']]) ending.append(new Option(t(`monitor.lineEnding.${k}`), v));
  ending.value = state.info.settings.lineEnding ?? '\n';
  renderMonitorButton();

  baud.onchange = async () => {
    api.app.settings({ baud: Number(baud.value) });
    if (state.monitorOpen) await connectMonitor();
  };
  ending.onchange = () => api.app.settings({ lineEnding: ending.value });
  $('#mon-connect').onclick = () => (state.monitorOpen ? disconnectMonitor() : connectMonitor());
  $('#monitor-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#monitor-input');
    if (!state.monitorOpen) await connectMonitor();
    if (!state.monitorOpen) return;
    await api.monitor.write(input.value + ending.value);
    input.value = '';
  };

  api.monitor.onData((text) => appendMonitor(text));
  api.monitor.onClosed(() => {
    if (!state.monitorOpen) return;
    state.monitorOpen = false;
    renderMonitorButton();
    appendMonitor(`\n${t('monitor.disconnected')}\n`, 'info');
  });
  api.monitor.onPaused(() => appendMonitor(`\n${t('monitor.pausedForUpload')}\n`, 'info'));
  api.monitor.onResumed((c) => appendMonitor(`${t('monitor.connected', { port: c.path, baud: c.baudRate })}\n`, 'info'));
}

async function connectMonitor() {
  showPanel('monitor');
  if (!state.port) {
    appendMonitor(`${t('build.noPort')}\n`, 'err');
    return;
  }
  const baud = Number($('#mon-baud').value);
  try {
    await api.monitor.open(state.port, baud);
    state.monitorOpen = true;
    appendMonitor(`${t('monitor.connected', { port: state.port, baud })}\n`, 'info');
  } catch (err) {
    state.monitorOpen = false;
    appendMonitor(`${cleanError(err)}\n`, 'err');
    for (const hint of friendlyHints(`${cleanError(err)} ${state.port}`, state.info.platform)) appendMonitor(`💡 ${hint}\n`, 'hint');
  }
  renderMonitorButton();
}

async function disconnectMonitor() {
  state.monitorOpen = false;
  await api.monitor.close();
  appendMonitor(`\n${t('monitor.disconnected')}\n`, 'info');
  renderMonitorButton();
}

function renderMonitorButton() {
  $('#mon-connect').textContent = state.monitorOpen ? t('monitor.disconnect') : t('monitor.connect');
}

const MONITOR_LIMIT = 200_000;

function appendMonitor(text, cls = '') {
  const log = $('#monitor-log');
  const last = log.lastChild;
  if (!cls && last && !last.className) last.textContent += text;
  else {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    log.append(span);
  }
  let total = log.textContent.length;
  while (total > MONITOR_LIMIT && log.firstChild) {
    total -= log.firstChild.textContent.length;
    log.firstChild.remove();
  }
  if ($('#mon-autoscroll').checked) log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------------------
// toolbar and menu

async function setupExamples() {
  const examples = await api.examples.list();
  const menu = $('#examples-menu');
  for (const ex of examples) {
    const b = document.createElement('button');
    b.innerHTML = `<strong></strong><small></small>`;
    b.querySelector('strong').textContent = ex.name;
    b.querySelector('small').textContent = ex.description;
    b.onclick = async () => {
      menu.hidden = true;
      if (!(await confirmDiscard())) return;
      try {
        openSketch(await api.examples.open(ex.name));
      } catch (err) {
        showError(err);
      }
    };
    menu.append(b);
  }
  $('#btn-examples').onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener('click', () => {
    menu.hidden = true;
  });
}

const actions = {
  verify: () => build(false),
  upload: () => build(true),
  new: async () => {
    if (await confirmDiscard()) openSketch(await api.sketch.create());
  },
  open: async () => {
    if (!(await confirmDiscard())) return;
    try {
      openSketch(await api.sketch.open());
    } catch (err) {
      showError(err);
    }
  },
  save: () => save(),
  saveAs: () => saveAs(),
  newTab: () => newTab(),
  pins: () => showView('pins'),
  code: () => showView('code'),
  monitor: () => ($('#monitor').hidden ? connectMonitor() : showPanel('output')),
  showFolder: () => api.sketch.showFolder(state.sketch.dir),
  settings: () => openSettings(),
};

function bindToolbar() {
  $('#btn-verify').onclick = actions.verify;
  $('#btn-upload').onclick = actions.upload;
  $('#btn-new').onclick = actions.new;
  $('#btn-open').onclick = actions.open;
  $('#btn-save').onclick = actions.save;
  $('#btn-monitor').onclick = actions.monitor;
  $('#btn-settings').onclick = actions.settings;
  $('#tab-code').onclick = actions.code;
  $('#tab-pins').onclick = actions.pins;
  $('#port-select').onchange = (e) => {
    state.port = e.target.value || null;
    api.app.settings({ port: state.port });
    renderBoardStatus();
  };
}

function renderBoardStatus() {
  $('#status-board').textContent = state.port
    ? t('status.boardOn', { board: BOARD.name, port: state.port })
    : t('status.notConnected', { board: BOARD.name });
}

// ---------------------------------------------------------------------------
// settings window

async function openSettings() {
  const settings = state.info.settings;
  const before = {
    language: getLanguage(),
    fontSize: settings.fontSize || DEFAULT_FONT_SIZE,
    sketchbook: state.info.sketchbook,
  };
  const root = $('#modal');
  const field = (label, control, note) => {
    const l = document.createElement('label');
    l.className = 'setting';
    const span = document.createElement('span');
    span.textContent = label;
    l.append(span, control);
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      l.append(small);
    }
    return l;
  };

  const language = document.createElement('select');
  language.name = 'language';
  for (const [code, name] of Object.entries(LANGUAGE_NAMES)) language.append(new Option(name, code));
  language.value = before.language;

  const fontSize = document.createElement('select');
  fontSize.name = 'fontSize';
  for (const size of FONT_SIZES) fontSize.append(new Option(`${size} px`, size));
  fontSize.value = before.fontSize;
  fontSize.onchange = () => editor.setFontSize(Number(fontSize.value)); // live preview

  let folder = before.sketchbook;
  const folderText = document.createElement('input');
  folderText.name = 'sketchbook';
  folderText.readOnly = true;
  folderText.value = folder;
  const browse = document.createElement('button');
  browse.type = 'button';
  browse.textContent = t('settings.browse');
  browse.onclick = async () => {
    const picked = await api.app.pickFolder();
    if (picked) folderText.value = folder = picked;
  };
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'link';
  reset.textContent = t('settings.default');
  reset.onclick = () => {
    folderText.value = folder = state.info.defaultSketchbook;
  };
  const folderRow = document.createElement('div');
  folderRow.className = 'folder-row';
  folderRow.append(folderText, browse);

  const form = document.createElement('form');
  form.className = 'settings';
  const title = document.createElement('h2');
  title.textContent = t('settings.title');
  const error = document.createElement('div');
  error.className = 'error';
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('dialog.cancel');
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.textContent = t('dialog.save');
  buttons.append(cancel, ok);
  const sketchbookField = field(t('settings.sketchbook'), folderRow, t('settings.sketchbookHint'));
  sketchbookField.append(reset);
  form.append(
    title,
    field(t('settings.language'), language, t('settings.languageNote')),
    field(t('settings.fontSize'), fontSize),
    sketchbookField,
    error,
    buttons,
  );

  const close = () => {
    root.hidden = true;
    root.replaceChildren();
  };
  cancel.onclick = () => {
    editor.setFontSize(before.fontSize);
    close();
  };
  form.onkeydown = (e) => {
    if (e.key === 'Escape') cancel.onclick();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const patch = { fontSize: Number(fontSize.value), language: language.value };
    const custom = folder === state.info.defaultSketchbook ? '' : folder;
    if (folder !== before.sketchbook) patch.sketchbook = custom;
    try {
      state.info.settings = await api.app.settings(patch);
    } catch (err) {
      error.textContent = t('settings.badFolder', { error: cleanError(err) });
      return;
    }
    state.info.sketchbook = folder;
    close();
    // Switching language redraws everything, so reload once the sketch is safe.
    if (patch.language !== before.language && (await confirmDiscard())) {
      api.app.setDirty(false);
      window.location.reload();
    }
  };

  root.replaceChildren(form);
  root.hidden = false;
  language.focus();
}

function bindMenu() {
  api.app.onMenu((action) => actions[action]?.());
}

// ---------------------------------------------------------------------------
// small helpers

function status(text, cls = '') {
  const s = $('#status-msg');
  s.textContent = text;
  s.className = cls;
}

function cleanError(err) {
  return String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function showError(err) {
  const msg = cleanError(err);
  appendOutput(`${msg}\n`, 'err');
  status(msg, 'error');
}

// Minimal modal dialog. Resolves with the clicked button id, or with the
// input text when `input` is given and the user confirms.
function modal({ message, input, buttons, validate: check }) {
  return new Promise((resolve) => {
    const root = $('#modal');
    const form = document.createElement('form');
    const p = document.createElement('p');
    p.textContent = message;
    form.append(p);
    let field = null;
    const error = document.createElement('div');
    error.className = 'error';
    if (input !== undefined) {
      field = document.createElement('input');
      field.value = input;
      form.append(field, error);
    }
    const row = document.createElement('div');
    row.className = 'buttons';
    const finish = (value) => {
      root.hidden = true;
      root.replaceChildren();
      resolve(value);
    };
    buttons.forEach(([id, label], i) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.type = i === buttons.length - 1 ? 'submit' : 'button';
      if (b.type === 'button') b.onclick = () => finish(field ? null : id);
      row.append(b);
    });
    form.append(row);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!field) return finish(buttons[buttons.length - 1][0]);
      const problem = check?.(field.value) ?? '';
      if (problem) {
        error.textContent = problem;
        return undefined;
      }
      return finish(field.value);
    };
    form.onkeydown = (e) => {
      if (e.key === 'Escape') finish(field ? null : buttons[0][0]);
    };
    root.replaceChildren(form);
    root.hidden = false;
    (field ?? row.lastChild).focus();
  });
}

// Monaco rejects pending work with "Canceled" when models are swapped; harmless.
const isCanceled = (err) => err?.name === 'Canceled' || err?.message === 'Canceled';
window.addEventListener('unhandledrejection', (e) => {
  if (isCanceled(e.reason)) e.preventDefault();
});
window.addEventListener('error', (e) => {
  if (isCanceled(e.error)) e.preventDefault();
});

init().catch((err) => {
  document.body.textContent = `STFIDE failed to start: ${err?.stack ?? err}`;
});
