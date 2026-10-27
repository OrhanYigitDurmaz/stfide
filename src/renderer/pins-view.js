// The Circuit tab: a Wokwi-style drawing of the STFKart with parts wired to
// it, a palette of parts, and an inspector for the selection, the
// communication buses, problems and generated code.

import { BOARD, PINS, PIN_BY_ID } from '../common/board.js';
import {
  BAUD_RATES, GENERATED_FILES, I2C_CLOCKS, INTERRUPT_MODES, assignRole, generate, handlerName,
  missingHandlers, resolve, rolesForPin, usageFor, validate,
} from '../common/pins.js';
import { COMPONENTS } from '../common/components.js';
import {
  BOARD_PART, COMM, COMMON_RESISTORS, PARTS, bandLabel, commLabel, formatResistance, optionLabel, parseResistance,
  partHint, partLabel, resistorBands,
} from '../common/parts.js';
import { deriveFromCircuit } from '../common/circuit.js';
import { t } from '../common/i18n.js';
import { CircuitCanvas, WIRE_COLORS } from './circuit-canvas.js';

export const ROLE_COLORS = {
  led: '#e0a526',
  output: '#3a8fd9',
  button: '#d9534f',
  input: '#4fa3a3',
  pwm: '#9b59b6',
  analog: '#27ae60',
  servo: '#e67e22',
  interrupt: '#e84393',
  buzzer: '#c0a020',
};

const PALETTE = [
  ['palette.basic', ['led', 'resistor', 'pushbutton', 'slideSwitch', 'potentiometer', 'buzzer']],
  ['palette.sensors', ['photoresistor', 'pir', 'ultrasonic', 'dht22', 'ds18b20']],
  ['palette.outputs', ['servo', 'relay', 'rgbLed', 'neopixelRing', 'lcd1602', 'lcd2004']],
];

function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}

// Which bus, if any, currently owns a pin.
function claimedBy(cfg, id) {
  const { serial, i2c, spi } = BOARD.peripherals;
  if (cfg.serial.enabled && serial.pins.includes(id)) return serial.labels[id];
  if (cfg.i2c.enabled && i2c.pins.includes(id)) return i2c.labels[id];
  if (cfg.spi.enabled && spi.pins.includes(id)) return spi.labels[id];
  return null;
}

function capabilities(id) {
  const p = PIN_BY_ID[id];
  const caps = ['Digital'];
  if (p.analog) caps.push('Analog in');
  if (p.pwm) caps.push(`PWM (Timer${p.timer})`);
  if (p.interrupt !== undefined) caps.push(`Interrupt INT${p.interrupt}`);
  for (const [bus, def] of Object.entries(BOARD.peripherals)) {
    if (def.labels[id]) caps.push(`${bus.toUpperCase()} ${def.labels[id]}`);
  }
  if (id === BOARD.ledBuiltin) caps.push('On-board LED');
  return caps;
}

const endLabel = (circuit, end) => (end.part === BOARD_PART
  ? end.pin.replace(/\.\d$/, '')
  : `${circuit.parts.find((p) => p.id === end.part)?.name ?? '?'} ${end.pin}`);

export class PinsView {
  constructor(root, { getConfig, setConfig, getSources, onInsertHandler }) {
    this.root = root;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.getSources = getSources;
    this.onInsertHandler = onInsertHandler;
    this.selection = null; // { kind: 'part' | 'wire' | 'board', id }
    this.selectedPin = null; // a board pin being set up by hand
    this.openGenerated = new Set();
    this.undoStack = [];
    this.redoStack = [];

    this.palette = h('aside', { class: 'palette' });
    const stage = h('div', { class: 'stage' });
    const canvasHost = h('div');
    this.inspector = h('aside', { class: 'inspector' });
    root.append(this.palette, stage, this.inspector);

    this.canvas = new CircuitCanvas(canvasHost, {
      getCircuit: () => this.getConfig().circuit,
      setCircuit: (circuit, selection) => {
        this.selection = selection;
        this.commit({ ...this.getConfig(), circuit });
      },
      onSelect: (sel) => this.select(sel),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
    });
    stage.append(canvasHost, h('div', { class: 'stage-tools' },
      h('button', { class: 'icon-btn', title: t('circuit.zoomOut'), onclick: () => this.canvas.zoomBy(1 / 1.2) }, '−'),
      h('button', { class: 'icon-btn', title: t('circuit.zoomIn'), onclick: () => this.canvas.zoomBy(1.2) }, '+'),
      h('button', { class: 'icon-btn', title: t('circuit.fit'), onclick: () => this.canvas.fit() }, '⤢'),
      h('button', { class: 'icon-btn', title: t('circuit.undo'), onclick: () => this.undo() }, '↶'),
      h('button', { class: 'icon-btn', title: t('circuit.redo'), onclick: () => this.redo() }, '↷'),
    ), h('div', { class: 'stage-hint' }, t('circuit.hint')));

    this.drawPalette();
    this.render();
  }

  // A different sketch was opened.
  reset() {
    this.selection = null;
    this.selectedPin = null;
    this.undoStack = [];
    this.redoStack = [];
    this.canvas.cancelWire();
    this.render();
    this.canvas.fitted = false;
    requestAnimationFrame(() => this.canvas.fit());
  }

  drawPalette() {
    this.palette.append(h('h3', {}, t('palette.title')));
    for (const [group, types] of PALETTE) {
      this.palette.append(h('div', { class: 'palette-group' }, t(group)));
      for (const type of types) {
        this.palette.append(h('button', {
          class: 'palette-item',
          title: partHint(type),
          onclick: () => this.canvas.add(type, this.takenNames()),
        }, partLabel(type)));
      }
    }
  }

  // Names used by pins set up by hand, so new parts don't clash with them.
  takenNames() {
    return new Set(Object.values(this.getConfig().pins).map((p) => p.name));
  }

  select(sel) {
    this.selection = sel;
    if (sel?.kind !== 'board') this.selectedPin = null;
    this.render();
    this.inspector.scrollTop = 0;
  }

  selectPin(id) {
    this.selection = { kind: 'board', id: BOARD_PART };
    this.selectedPin = id;
    this.render();
    this.inspector.querySelector('.pin-editor')?.scrollIntoView({ block: 'nearest' });
    this.inspector.querySelector('select[name=role]')?.focus();
  }

  commit(next) {
    this.undoStack.push(this.getConfig());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.setConfig(next);
    this.render();
  }

  update(mutator) {
    const next = structuredClone(this.getConfig());
    mutator(next);
    this.commit(next);
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.getConfig());
    this.setConfig(this.undoStack.pop());
    this.canvas.cancelWire();
    this.render();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.getConfig());
    this.setConfig(this.redoStack.pop());
    this.render();
  }

  render() {
    const cfg = this.getConfig();
    const circuit = cfg.circuit;
    const sel = this.selection;
    if (sel?.kind === 'part' && !circuit.parts.some((p) => p.id === sel.id)) this.selection = null;
    if (sel?.kind === 'wire' && !circuit.wires.some((w) => w.id === sel.id)) this.selection = null;

    const marks = new Map(Object.entries(cfg.pins).map(([id, p]) => [id, ROLE_COLORS[p.role]]));
    this.canvas.render(this.selection, marks);

    const derived = deriveFromCircuit(circuit);
    const issues = validate(cfg);
    const s = this.selection;
    this.inspector.replaceChildren(...[
      s?.kind === 'part' ? this.renderPart(cfg, derived, s.id)
        : s?.kind === 'wire' ? this.renderWire(cfg, s.id)
          : s?.kind === 'board' ? this.renderBoard(cfg, derived)
            : this.renderHelp(),
      this.renderBuses(cfg, derived, s?.kind === 'part' ? this.partBuses(circuit, s.id) : null),
      this.renderIssues(issues),
      this.renderGenerated(cfg),
    ].filter(Boolean));
  }

  renderHelp() {
    return h('section', {},
      h('h2', {}, t('circuit.title')),
      h('ul', { class: 'help' }, ['circuit.help1', 'circuit.help2', 'circuit.help3', 'circuit.help4'].map((k) => h('li', {}, t(k)))));
  }

  renderPart(cfg, derived, id) {
    const part = cfg.circuit.parts.find((p) => p.id === id);
    const def = PARTS[part.type];
    const edit = (fn) => this.update((next) => fn(next.circuit.parts.find((p) => p.id === id)));
    const section = h('section', {}, h('h2', {}, partLabel(part.type)));
    if (def.hint) section.append(h('p', { class: 'empty' }, partHint(part.type)));

    if (def.bind) {
      section.append(h('label', { class: 'field' }, h('span', {}, t('pins.name')),
        h('input', { value: part.name, spellcheck: 'false', onchange: (e) => edit((p) => { p.name = e.target.value.trim(); }) })));
    }
    for (const o of def.options ?? []) {
      const value = part.options[o.key];
      if (o.type === 'resistance') {
        section.append(...this.renderResistance(part, o, edit));
        continue;
      }
      const input = o.choices
        ? h('select', { onchange: (e) => edit((p) => { p.options[o.key] = e.target.value; }) },
          o.choices.map((v) => h('option', { value: v, selected: String(v) === String(value) }, v)))
        : h('input', {
          type: 'number', min: o.min, max: o.max, value,
          onchange: (e) => edit((p) => { p.options[o.key] = Number(e.target.value); }),
        });
      section.append(h('label', { class: 'field' }, h('span', {}, optionLabel(o)), input));
    }

    const comm = def.comm ?? 'nocomm';
    section.append(h('div', { class: 'field' }, h('span', {}, t('circuit.protocol')),
      h('span', { class: 'caps' }, h('span', { class: `chip comm ${comm}` }, commLabel(comm)))));

    // What it ended up connected to, and how to use it in code.
    const resolved = resolve(cfg);
    const pinEntry = derived.pins.find(([, , partId]) => partId === id);
    const comp = derived.components.find((c) => c.id === id);
    if (def.bind) {
      const wired = pinEntry ? [pinEntry[0]] : comp ? Object.values(comp.pins) : [];
      section.append(h('div', { class: 'field' }, h('span', {}, t('circuit.connectedTo')),
        wired.length
          ? h('span', { class: 'caps' }, wired.map((p) => h('span', { class: 'chip' }, p)))
          : h('span', { class: 'muted' }, t('circuit.nothing'))));
    }
    let usage = [];
    if (pinEntry && resolved.pins[pinEntry[0]]?.name === part.name) usage = usageFor(resolved.pins[pinEntry[0]]);
    if (comp) usage = COMPONENTS[comp.type].usage(comp);
    if (usage.length) section.append(h('h3', {}, t('pins.usage')), ...usage.map((u) => h('pre', { class: 'snippet' }, u)));
    const libs = def.bind?.component ? COMPONENTS[def.bind.component].libraries : null;
    if (libs?.length) {
      section.append(h('div', { class: 'field' }, h('span', {}, t('components.library')),
        h('span', { class: 'lib' }, libs.map((l) => l.split('@')[0]).join(', '))));
    }
    section.append(h('div', { class: 'actions' },
      h('button', { onclick: () => this.canvas.rotateSelection() }, t('circuit.rotate')),
      h('button', { class: 'danger', onclick: () => this.canvas.deleteSelection() }, t('circuit.delete'))));
    return section;
  }

  // A free-typed resistor value. The drawing's bands follow while typing; the
  // value is saved (rounded to what 4 bands can show) when the field is left.
  renderResistance(part, o, edit) {
    const current = Number(part.options[o.key]) || Number(o.default);
    const bands = h('div', { class: 'bands' });
    const showBands = (ohms) => bands.replaceChildren(...resistorBands(ohms).map((d) => h('span', { class: `band b${d}`, title: bandLabel(d) }, bandLabel(d))));
    showBands(current);
    const listId = `resistors-${part.id}`;
    const input = h('input', {
      value: formatResistance(current),
      list: listId,
      spellcheck: 'false',
      title: t('circuit.resistanceHelp'),
      oninput: (e) => {
        const ohms = parseResistance(e.target.value);
        e.target.classList.toggle('invalid', ohms === null);
        if (ohms === null) return;
        this.canvas.previewAttr(part.id, o.attr, String(ohms));
        showBands(ohms);
      },
      onchange: (e) => {
        const ohms = parseResistance(e.target.value);
        if (ohms === null || ohms === current) {
          e.target.value = formatResistance(current);
          e.target.classList.remove('invalid');
          this.canvas.previewAttr(part.id, o.attr, String(current));
          showBands(current);
          return;
        }
        edit((p) => { p.options[o.key] = String(ohms); });
      },
    });
    return [
      h('label', { class: 'field' }, h('span', {}, optionLabel(o)), input,
        h('datalist', { id: listId }, COMMON_RESISTORS.map((v) => h('option', { value: formatResistance(v) })))),
      h('div', { class: 'field' }, h('span', {}, t('circuit.bands')), bands),
    ];
  }

  // The buses a selected part talks over; null when it isn't a part.
  partBuses(circuit, id) {
    const part = circuit.parts.find((p) => p.id === id);
    return part ? COMM[PARTS[part.type].comm ?? 'nocomm'].buses : null;
  }

  renderWire(cfg, id) {
    const wire = cfg.circuit.wires.find((w) => w.id === id);
    return h('section', {},
      h('h2', {}, t('circuit.wire')),
      h('p', { class: 'empty' }, `${endLabel(cfg.circuit, wire.from)} → ${endLabel(cfg.circuit, wire.to)}`),
      h('div', { class: 'field' }, h('span', {}, t('circuit.color')),
        h('div', { class: 'swatches' }, Object.entries(WIRE_COLORS).map(([name, color]) => h('button', {
          class: `swatch${wire.color === name ? ' active' : ''}`,
          title: name,
          style: `background:${color}`,
          onclick: () => this.update((next) => { next.circuit.wires.find((w) => w.id === id).color = name; }),
        })))),
      h('div', { class: 'actions' },
        h('button', { class: 'danger', onclick: () => this.canvas.deleteSelection() }, t('circuit.delete'))));
  }

  // The board: every signal pin and what uses it. Pins no part is wired to
  // can still be given a role by hand (plain digital input/output etc).
  renderBoard(cfg, derived) {
    const byPin = new Map();
    const use = (pin, partId, label) => {
      const u = byPin.get(pin);
      byPin.set(pin, u ? { partId: u.partId, label: `${u.label}, ${label}` } : { partId, label });
    };
    for (const [pin, role, partId] of derived.pins) use(pin, partId, role.name);
    for (const c of derived.components) {
      for (const { key, label } of COMPONENTS[c.type].pins) if (c.pins[key]) use(c.pins[key], c.id, `${c.name} ${label}`);
    }
    const rows = PINS.map(({ id }) => {
      const used = byPin.get(id);
      const manual = cfg.pins[id];
      const claim = claimedBy(cfg, id);
      const what = used ? used.label
        : manual ? `${manual.name || '?'} · ${t(`role.${manual.role}`)}`
          : claim ?? '—';
      return h('tr', {
        class: `${id === this.selectedPin ? 'active' : ''} ${used ? 'wired' : ''}`,
        onclick: () => (used ? this.select({ kind: 'part', id: used.partId }) : this.selectPin(id)),
      },
      h('td', {}, manual && !used ? h('span', { class: 'dot', style: `background:${ROLE_COLORS[manual.role]}` }) : null, id),
      h('td', {}, what));
    });
    return h('section', {},
      h('h2', {}, BOARD.name),
      h('p', { class: 'empty' }, t('circuit.boardHint')),
      h('table', { class: 'pin-table' }, h('tbody', {}, rows)),
      this.selectedPin && !byPin.has(this.selectedPin) ? this.renderPinSection(cfg) : null);
  }

  renderPinSection(cfg) {
    const id = this.selectedPin;
    const p = cfg.pins[id];
    const role = p?.role ?? 'unused';
    const section = h('div', { class: 'pin-editor' },
      h('h3', {}, t('pins.pin', { pin: id })),
      h('div', { class: 'caps' }, capabilities(id).map((c) => h('span', {}, c))),
    );

    const roleSelect = h('select', {
      name: 'role',
      onchange: (e) => this.update((c) => Object.assign(c, assignRole(c, id, e.target.value))),
    }, rolesForPin(id).map((r) => h('option', { value: r, selected: r === role }, t(`role.${r}`))));
    section.append(h('label', { class: 'field' }, h('span', {}, t('pins.role')), roleSelect));
    if (!p) return section;

    const setField = (key, value) => this.update((c) => {
      c.pins[id][key] = value;
    });

    section.append(h('label', { class: 'field' },
      h('span', {}, t('pins.name')),
      h('input', {
        value: p.name,
        placeholder: t('pins.namePlaceholder'),
        spellcheck: 'false',
        onchange: (e) => this.update((c) => {
          const pin = c.pins[id];
          const oldDefault = pin.role === 'interrupt' && pin.handler === handlerName(pin.name);
          pin.name = e.target.value.trim();
          if (oldDefault && pin.name) pin.handler = handlerName(pin.name);
        }),
      })));

    if (role === 'led' || role === 'output') {
      section.append(h('label', { class: 'field' }, h('span', {}, t('pins.initial')),
        h('select', { onchange: (e) => setField('initial', e.target.value) },
          h('option', { value: 'LOW', selected: p.initial !== 'HIGH' }, t('pins.initial.low')),
          h('option', { value: 'HIGH', selected: p.initial === 'HIGH' }, t('pins.initial.high')))));
    }
    if (role === 'pwm') {
      section.append(h('label', { class: 'field' }, h('span', {}, t('pins.pwmStart')),
        h('input', { type: 'number', min: 0, max: 255, value: p.value ?? 0, onchange: (e) => setField('value', Number(e.target.value)) })));
    }
    if (role === 'servo') {
      section.append(h('label', { class: 'field' }, h('span', {}, t('pins.angle')),
        h('input', { type: 'number', min: 0, max: 180, value: p.angle ?? 90, onchange: (e) => setField('angle', Number(e.target.value)) })));
    }
    if (role === 'input' || role === 'interrupt') {
      section.append(h('label', { class: 'field check' },
        h('input', { type: 'checkbox', checked: Boolean(p.pullup), onchange: (e) => setField('pullup', e.target.checked) }),
        h('span', {}, t('pins.pullup'))));
    }
    if (role === 'interrupt') {
      section.append(
        h('label', { class: 'field' }, h('span', {}, t('pins.trigger')),
          h('select', { onchange: (e) => setField('mode', e.target.value) },
            INTERRUPT_MODES.map((m) => h('option', { value: m, selected: p.mode === m }, t(`pins.trigger.${m}`))))),
        h('label', { class: 'field' }, h('span', {}, t('pins.handler')),
          h('input', { value: p.handler, spellcheck: 'false', onchange: (e) => setField('handler', e.target.value.trim()) })),
      );
    }

    const usage = usageFor(p);
    if (usage.length) {
      section.append(h('h3', {}, t('pins.usage')), ...usage.map((s) => h('pre', { class: 'snippet' }, s)));
    }
    return section;
  }

  // only: bus keys to show (for the selected part), or null for all of them.
  renderBuses(cfg, derived, only = null) {
    if (only && !only.length) return null;
    const shown = (key) => !only || only.includes(key);
    const bus = (key, label, pins, extra, forced) => h('div', { class: 'periph' },
      h('label', { class: 'head', title: forced ? t('circuit.i2cForced') : '' },
        h('input', {
          type: 'checkbox',
          checked: cfg[key].enabled || forced,
          disabled: forced,
          onchange: (e) => this.update((c) => {
            c[key].enabled = e.target.checked;
          }),
        }),
        label,
        h('small', {}, pins)),
      cfg[key].enabled || forced ? extra : null);

    return h('section', {},
      h('h3', {}, t('pins.peripherals')),
      shown('serial') && bus('serial', t('pins.serial'), 'D0 RX · D1 TX',
        h('label', { class: 'field' }, h('span', {}, t('pins.baud')),
          h('select', { onchange: (e) => this.update((c) => { c.serial.baud = Number(e.target.value); }) },
            BAUD_RATES.map((b) => h('option', { value: b, selected: b === Number(cfg.serial.baud) }, String(b)))))),
      shown('i2c') && bus('i2c', t('pins.i2c'), 'A4 SDA · A5 SCL',
        h('label', { class: 'field' }, h('span', {}, t('pins.i2cClock')),
          h('select', { onchange: (e) => this.update((c) => { c.i2c.clock = Number(e.target.value); }) },
            I2C_CLOCKS.map((b) => h('option', { value: b, selected: b === Number(cfg.i2c.clock) }, `${b / 1000} kHz`)))),
        derived.i2c),
      shown('spi') && bus('spi', t('pins.spi'), 'D11 MOSI · D12 MISO · D13 SCK', null),
    );
  }

  renderIssues(issues) {
    const cfg = this.getConfig();
    const missing = missingHandlers(cfg, this.getSources())
      .map((fn) => h('p', {}, h('button', { class: 'link', onclick: () => this.onInsertHandler(fn) }, t('pins.insertHandler', { fn }))));
    return h('section', {},
      h('h3', {}, t('pins.issues')),
      h('ul', { class: 'issues' },
        issues.length
          ? issues.map((i) => h('li', { class: i.level, onclick: () => this.showIssue(i) }, i.message))
          : h('li', { class: 'ok' }, t('pins.noIssues'))),
      missing,
    );
  }

  // Selects whatever a problem is about: the part using its pin, or the pin.
  showIssue(issue) {
    const pin = issue.pins[0];
    if (!pin) return;
    const derived = deriveFromCircuit(this.getConfig().circuit);
    const entry = derived.pins.find(([p]) => p === pin);
    const comp = derived.components.find((c) => Object.values(c.pins).includes(pin));
    const partId = entry?.[2] ?? comp?.id;
    if (partId && !this.getConfig().pins[pin]) this.select({ kind: 'part', id: partId });
    else this.selectPin(pin);
  }

  renderGenerated(cfg) {
    const files = generate(cfg);
    return h('section', {},
      h('h3', {}, t('pins.generated')),
      GENERATED_FILES.map((name) => {
        const d = h('details', { open: this.openGenerated.has(name) },
          h('summary', {}, name),
          h('pre', { class: 'code' }, files[name]));
        d.addEventListener('toggle', () => {
          if (d.open) this.openGenerated.add(name);
          else this.openGenerated.delete(name);
        });
        return d;
      }),
    );
  }
}
