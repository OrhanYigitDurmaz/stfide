// The Pins tab: a drawing of the STFKart, plus an inspector for the
// selected pin, the communication buses, problems and generated code.

import { BOARD, HEADERS, PIN_BY_ID } from '../common/board.js';
import {
  BAUD_RATES, GENERATED_FILES, I2C_CLOCKS, INTERRUPT_MODES, assignRole, generate, handlerName, missingHandlers, rolesForPin, usageFor, validate,
} from '../common/pins.js';
import { t } from '../common/i18n.js';

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

const SVG = 'http://www.w3.org/2000/svg';
const PIN = 32;
const STEP = 38;

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}

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

export class PinsView {
  constructor(root, { getConfig, setConfig, getSources, onInsertHandler }) {
    this.root = root;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.getSources = getSources;
    this.onInsertHandler = onInsertHandler;
    this.selected = null;
    this.pinNodes = new Map();
    this.openGenerated = new Set();

    this.boardArea = h('div', { class: 'board-area' });
    this.inspector = h('aside', { class: 'inspector' });
    root.append(this.boardArea, this.inspector);
    this.drawBoard();
    this.render();
  }

  drawBoard() {
    this.boardArea.append(h('div', { class: 'hint' }, t('pins.hint')));
    const svg = el('svg', { class: 'board-svg', viewBox: '0 0 760 600' });
    this.boardArea.append(svg);
    el('rect', { class: 'pcb', x: 20, y: 110, width: 720, height: 380, rx: 18 }, svg);
    el('rect', { class: 'usb', x: 6, y: 170, width: 78, height: 70, rx: 4 }, svg);
    el('rect', { class: 'jack', x: 10, y: 380, width: 70, height: 66, rx: 6 }, svg);
    el('rect', { class: 'chip', x: 330, y: 280, width: 300, height: 80, rx: 4 }, svg);
    el('text', { class: 'chip-text', x: 480, y: 325, 'text-anchor': 'middle' }, svg).textContent = BOARD.mcu;
    el('text', { class: 'silk', x: 150, y: 300, style: 'font-size:30px' }, svg).textContent = BOARD.name;
    el('text', { class: 'silk small', x: 152, y: 322 }, svg).textContent = 'Uno compatible · 5 V · 16 MHz';
    el('circle', { class: 'led-dot', cx: 182, cy: 200, r: 6 }, svg);
    el('text', { class: 'silk small', x: 194, y: 204 }, svg).textContent = 'L (D13)';

    // Top header, D13..D0, with the Uno's gap between D8 and D7.
    const topY = 124;
    el('rect', { class: 'header-bg', x: 186, y: topY - 4, width: 14 * STEP + 18, height: PIN + 8, rx: 3 }, svg);
    HEADERS.top.forEach((id, i) => {
      const x = 190 + i * STEP + (i >= 6 ? 14 : 0);
      this.drawPin(svg, id, x, topY, 'top');
    });

    // Bottom header: power (not configurable), then A0..A5.
    const botY = 440;
    el('rect', { class: 'header-bg', x: 196, y: botY - 4, width: 7 * STEP + 8, height: PIN + 8, rx: 3 }, svg);
    HEADERS.power.forEach((label, i) => {
      const x = 200 + i * STEP;
      const g = el('g', { class: 'powerpin' }, svg);
      el('rect', { x, y: botY, width: PIN, height: PIN, rx: 3 }, g);
      el('text', { class: 'pin-label', x: x + PIN / 2, y: botY - 10, 'text-anchor': 'middle', style: 'font-size:9px' }, svg).textContent = label;
    });
    el('rect', { class: 'header-bg', x: 486, y: botY - 4, width: 6 * STEP + 8, height: PIN + 8, rx: 3 }, svg);
    HEADERS.bottom.forEach((id, i) => this.drawPin(svg, id, 490 + i * STEP, botY, 'bottom'));
  }

  drawPin(svg, id, x, y, side) {
    const g = el('g', { class: 'pin', tabindex: 0, 'data-pin': id }, svg);
    el('rect', { x, y, width: PIN, height: PIN, rx: 4 }, g);
    const cx = x + PIN / 2;
    el('text', { class: 'pin-label', x: cx, y: side === 'top' ? y + PIN + 18 : y - 10, 'text-anchor': 'middle' }, svg).textContent = id;
    const nameY = side === 'top' ? y - 14 : y + PIN + 16;
    const name = el('text', {
      class: 'pin-name',
      x: cx,
      y: nameY,
      transform: `rotate(${side === 'top' ? -40 : 40} ${cx} ${nameY})`,
    }, svg);
    const title = el('title', {}, g);
    g.addEventListener('click', () => this.select(id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.select(id);
    });
    this.pinNodes.set(id, { g, name, title });
  }

  select(id) {
    this.selected = id;
    this.render();
    this.inspector.querySelector('select[name=role]')?.focus();
  }

  update(mutator) {
    const next = structuredClone(this.getConfig());
    mutator(next);
    this.setConfig(next);
    this.render();
  }

  render() {
    const cfg = this.getConfig();
    const issues = validate(cfg);
    const flagged = new Map();
    for (const i of issues) for (const p of i.pins) if (flagged.get(p) !== 'error') flagged.set(p, i.level);

    for (const [id, { g, name, title }] of this.pinNodes) {
      const p = cfg.pins[id];
      const claim = claimedBy(cfg, id);
      g.classList.toggle('used', Boolean(p));
      g.classList.toggle('claimed', !p && Boolean(claim));
      g.classList.toggle('selected', id === this.selected);
      g.classList.toggle('error', flagged.get(id) === 'error');
      g.classList.toggle('warning', flagged.get(id) === 'warning');
      g.style.setProperty('--pin-color', p ? ROLE_COLORS[p.role] : '');
      name.textContent = p ? p.name : claim ?? '';
      name.style.fill = p ? '#fff' : '#b9aef0';
      title.textContent = p ? `${id}: ${p.name} (${t(`role.${p.role}`)})` : claim ? `${id}: ${claim}` : id;
    }

    this.inspector.replaceChildren(
      this.renderPinSection(cfg),
      this.renderBuses(cfg),
      this.renderIssues(issues),
      this.renderGenerated(cfg),
    );
  }

  renderPinSection(cfg) {
    const id = this.selected;
    if (!id) return h('section', {}, h('h2', {}, t('pins.title')), h('p', { class: 'empty' }, t('pins.hint')));
    const p = cfg.pins[id];
    const role = p?.role ?? 'unused';
    const section = h('section', {},
      h('h2', {}, t('pins.pin', { pin: id })),
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

  renderBuses(cfg) {
    const bus = (key, label, pins, extra) => h('div', { class: 'periph' },
      h('label', { class: 'head' },
        h('input', {
          type: 'checkbox',
          checked: cfg[key].enabled,
          onchange: (e) => this.update((c) => {
            c[key].enabled = e.target.checked;
          }),
        }),
        label,
        h('small', {}, pins)),
      cfg[key].enabled ? extra : null);

    return h('section', {},
      h('h3', {}, t('pins.peripherals')),
      bus('serial', t('pins.serial'), 'D0 RX · D1 TX',
        h('label', { class: 'field' }, h('span', {}, t('pins.baud')),
          h('select', { onchange: (e) => this.update((c) => { c.serial.baud = Number(e.target.value); }) },
            BAUD_RATES.map((b) => h('option', { value: b, selected: b === Number(cfg.serial.baud) }, String(b)))))),
      bus('i2c', t('pins.i2c'), 'A4 SDA · A5 SCL',
        h('label', { class: 'field' }, h('span', {}, t('pins.i2cClock')),
          h('select', { onchange: (e) => this.update((c) => { c.i2c.clock = Number(e.target.value); }) },
            I2C_CLOCKS.map((b) => h('option', { value: b, selected: b === Number(cfg.i2c.clock) }, `${b / 1000} kHz`))))),
      bus('spi', t('pins.spi'), 'D11 MOSI · D12 MISO · D13 SCK', null),
    );
  }

  renderIssues(issues) {
    const cfg = this.getConfig();
    const missing = missingHandlerButtons(cfg, this.getSources(), this.onInsertHandler);
    return h('section', {},
      h('h3', {}, t('pins.issues')),
      h('ul', { class: 'issues' },
        issues.length
          ? issues.map((i) => h('li', { class: i.level, onclick: () => this.select(i.pins[0]) }, i.message))
          : h('li', { class: 'ok' }, t('pins.noIssues'))),
      missing,
    );
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

function missingHandlerButtons(cfg, sources, onInsert) {
  return missingHandlers(cfg, sources)
    .map((fn) => h('p', {}, h('button', { class: 'link', onclick: () => onInsert(fn) }, t('pins.insertHandler', { fn }))));
}
