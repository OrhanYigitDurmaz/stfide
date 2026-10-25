// Pin configuration model for the Circuit tab: what each role means, how a
// configuration is checked, and the Arduino code generated from it.
//
// A configuration is stored in the sketch folder as stfkart.pins.json:
//   {
//     "version": 1,
//     "pins": { "D13": { "role": "led", "name": "redLed" }, ... },
//     "serial": { "enabled": true, "baud": 9600 },
//     "i2c": { "enabled": false, "clock": 100000 },
//     "spi": { "enabled": false },
//     "components": [{ "id": "c1", "type": "dht", "name": "climate",
//                      "pins": { "data": "D2" }, "options": { "model": "DHT11" } }]
//   }
// The generated stfkart_pins.h / stfkart_pins.cpp sit next to it. They are
// always rewritten in full, so the user's own .ino is never touched.

import { BOARD, PINS, PIN_BY_ID } from './board.js';
import { COMPONENTS, HELPERS } from './components.js';
import { deriveFromCircuit, emptyCircuit, migrateToCircuit, normalizeCircuit } from './circuit.js';
import { t } from './i18n.js';

export const CONFIG_FILE = 'stfkart.pins.json';
export const HEADER_FILE = 'stfkart_pins.h';
export const SOURCE_FILE = 'stfkart_pins.cpp';
export const GENERATED_FILES = [HEADER_FILE, SOURCE_FILE];

export const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000];
export const I2C_CLOCKS = [100000, 400000];
export const INTERRUPT_MODES = ['FALLING', 'RISING', 'CHANGE'];

const anyPin = () => true;

// Roles in the order they appear in the role picker.
// `prefix` is used to suggest a default name.
export const ROLES = {
  unused: { allowed: anyPin },
  led: { allowed: anyPin, prefix: 'led', defaults: { initial: 'LOW' } },
  button: { allowed: anyPin, prefix: 'button', defaults: {} },
  output: { allowed: anyPin, prefix: 'output', defaults: { initial: 'LOW' } },
  input: { allowed: anyPin, prefix: 'input', defaults: { pullup: false } },
  pwm: { allowed: (p) => p.pwm, prefix: 'pwm', defaults: { value: 0 }, why: 'issue.pwmPins' },
  analog: { allowed: (p) => p.analog, prefix: 'sensor', defaults: {}, why: 'issue.analogPins' },
  servo: { allowed: anyPin, prefix: 'servo', defaults: { angle: 90 } },
  interrupt: {
    allowed: (p) => p.interrupt !== undefined,
    prefix: 'trigger',
    defaults: { mode: 'FALLING', pullup: true },
    why: 'issue.interruptPins',
  },
  buzzer: { allowed: anyPin, prefix: 'buzzer', defaults: {} },
};

export function rolesForPin(pinId) {
  const pin = PIN_BY_ID[pinId];
  return Object.keys(ROLES).filter((r) => ROLES[r].allowed(pin));
}

export function emptyConfig() {
  return {
    version: 2,
    pins: {},
    serial: { enabled: true, baud: 9600 },
    i2c: { enabled: false, clock: 100000 },
    spi: { enabled: false },
    components: [],
    circuit: emptyCircuit(),
  };
}

// Fills in missing fields so older or hand-written files still load.
export function normalizeConfig(raw) {
  const base = emptyConfig();
  const cfg = {
    version: 2,
    pins: {},
    serial: { ...base.serial, ...(raw?.serial ?? {}) },
    i2c: { ...base.i2c, ...(raw?.i2c ?? {}) },
    spi: { ...base.spi, ...(raw?.spi ?? {}) },
    components: [],
  };
  for (const [id, p] of Object.entries(raw?.pins ?? {})) {
    if (!PIN_BY_ID[id] || !p || !ROLES[p.role] || p.role === 'unused') continue;
    cfg.pins[id] = { ...ROLES[p.role].defaults, ...p };
  }
  for (const c of raw?.components ?? []) {
    const def = COMPONENTS[c?.type];
    if (!def) continue;
    const pins = {};
    for (const { key } of def.pins) if (PIN_BY_ID[c.pins?.[key]]) pins[key] = c.pins[key];
    const options = {};
    for (const o of def.options ?? []) options[o.key] = c.options?.[o.key] ?? o.default;
    cfg.components.push({ id: String(c.id || `c${cfg.components.length + 1}`), type: c.type, name: String(c.name ?? ''), pins, options });
  }
  if (raw?.circuit) {
    cfg.circuit = normalizeCircuit(raw.circuit);
  } else {
    // Sketches from before the circuit editor: draw their parts.
    const m = migrateToCircuit(cfg.pins, cfg.components);
    Object.assign(cfg, { circuit: m.circuit, pins: m.pins, components: m.components });
  }
  return cfg;
}

// Adds what the circuit implies (pin roles and components wired on the
// canvas) to the pins set directly. Everything that checks or generates code
// works on the result. Problems found in the circuit travel along in
// `circuitIssues`.
export function resolve(cfg) {
  if (!cfg.circuit) return cfg;
  const derived = deriveFromCircuit(cfg.circuit);
  const out = { ...cfg, pins: { ...cfg.pins }, components: [...cfg.components], i2c: { ...cfg.i2c }, circuit: undefined };
  out.circuitIssues = [...derived.issues];
  const byPin = new Map(Object.entries(cfg.pins).map(([pin, p]) => [pin, p.name]));
  for (const [pin, role] of derived.pins) {
    if (out.pins[pin]) {
      out.circuitIssues.push({ level: 'error', pins: [pin], message: t('issue.pinShared', { pin, users: `${byPin.get(pin)}, ${role.name}` }) });
      continue;
    }
    out.pins[pin] = { ...ROLES[role.role].defaults, ...role };
    byPin.set(pin, role.name);
  }
  out.components.push(...derived.components);
  if (derived.i2c) out.i2c.enabled = true;
  return out;
}

// ---------------------------------------------------------------------------
// Components

// What can drive a component pin.
export function pinSupports(pinId, need) {
  const pin = PIN_BY_ID[pinId];
  if (!pin) return false;
  if (need === 'pwm') return pin.pwm;
  if (need === 'interrupt') return pin.interrupt !== undefined;
  return true;
}

// Every use of every pin: [{ pin, owner, label }], where owner is a pin id
// for single-pin roles or a component id.
export function pinUses(cfg) {
  const uses = Object.entries(cfg.pins).map(([pin, p]) => ({ pin, owner: pin, label: p.name || pin }));
  for (const c of cfg.components) {
    const def = COMPONENTS[c.type];
    for (const { key, label } of def.pins) {
      if (c.pins[key]) uses.push({ pin: c.pins[key], owner: c.id, label: `${c.name || def.name} (${label})` });
    }
  }
  return uses;
}

// Pins taken by roles, components or enabled buses.
function takenPins(cfg, exceptComponent) {
  const taken = new Set(pinUses(cfg).filter((u) => u.owner !== exceptComponent).map((u) => u.pin));
  const { serial, i2c, spi } = BOARD.peripherals;
  if (cfg.serial.enabled) serial.pins.forEach((p) => taken.add(p));
  if (cfg.i2c.enabled) i2c.pins.forEach((p) => taken.add(p));
  if (cfg.spi.enabled) spi.pins.forEach((p) => taken.add(p));
  return taken;
}

// Free pins a component pin could move to, best first. D13 (on-board LED)
// and D0/D1 (USB) come last.
export function freePinsFor(cfg, need, exceptComponent) {
  const taken = takenPins(cfg, exceptComponent);
  const last = new Set(['D13', 'D0', 'D1']);
  return PINS.map((p) => p.id)
    .filter((id) => !taken.has(id) && pinSupports(id, need))
    .sort((a, b) => Number(last.has(a)) - Number(last.has(b)));
}

function allNames(cfg) {
  return new Set([
    ...Object.values(cfg.pins).flatMap((p) => (p.name ? namesForPin(p) : [])),
    ...cfg.components.map((c) => c.name),
  ]);
}

export function addComponent(cfg, type) {
  const def = COMPONENTS[type];
  const next = structuredClone(cfg);
  const taken = allNames(next);
  let name = def.prefix;
  for (let i = 2; taken.has(name); i++) name = `${def.prefix}${i}`;
  let n = next.components.length + 1;
  while (next.components.some((c) => c.id === `c${n}`)) n++;
  const comp = { id: `c${n}`, type, name, pins: {}, options: {} };
  for (const o of def.options ?? []) comp.options[o.key] = o.default;
  next.components.push(comp);
  for (const { key, needs } of def.pins) {
    const free = freePinsFor(next, needs);
    if (free.length) comp.pins[key] = free[0];
  }
  if (def.bus === 'i2c') next.i2c.enabled = true;
  return next;
}

export function removeComponent(cfg, id) {
  const next = structuredClone(cfg);
  next.components = next.components.filter((c) => c.id !== id);
  return next;
}

// Picks a free default name like led1, led2...
export function suggestName(cfg, role) {
  const prefix = ROLES[role]?.prefix ?? 'pin';
  const taken = new Set(Object.values(cfg.pins).map((p) => p.name));
  for (let i = 1; ; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

// Sets (or clears) the role of one pin, keeping the name when it still fits.
export function assignRole(cfg, pinId, role) {
  const next = structuredClone(cfg);
  if (role === 'unused') {
    delete next.pins[pinId];
    return next;
  }
  const prev = next.pins[pinId];
  const keepName = prev?.name && !new RegExp(`^${ROLES[prev.role]?.prefix}\\d+$`).test(prev.name);
  next.pins[pinId] = {
    ...ROLES[role].defaults,
    role,
    name: keepName ? prev.name : suggestName(next, role),
  };
  if (role === 'interrupt') next.pins[pinId].handler = handlerName(next.pins[pinId].name);
  return next;
}

export function handlerName(name) {
  return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// Names generated for a pin, used for duplicate checks and autocomplete.
export function namesForPin(p) {
  switch (p.role) {
    case 'servo': return [p.name, `${p.name}Pin`];
    case 'button': return [p.name, `${p.name}Pressed`];
    case 'interrupt': return [p.name, p.handler];
    default: return [p.name];
  }
}

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

const RESERVED = new Set([
  // C++ keywords
  'alignas', 'alignof', 'and', 'asm', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class',
  'const', 'constexpr', 'continue', 'decltype', 'default', 'delete', 'do', 'double', 'else', 'enum',
  'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int',
  'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'nullptr', 'operator', 'or', 'private',
  'protected', 'public', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct',
  'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union', 'unsigned',
  'using', 'virtual', 'void', 'volatile', 'while', 'xor',
  // Arduino core names
  'setup', 'loop', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'Serial', 'Wire',
  'SPI', 'Servo', 'String', 'byte', 'word', 'boolean', 'PI', 'HALF_PI', 'TWO_PI', 'DEG_TO_RAD',
  'RAD_TO_DEG', 'SS', 'MOSI', 'MISO', 'SCK', 'SDA', 'SCL', 'RISING', 'FALLING', 'CHANGE',
  'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReference', 'delay',
  'delayMicroseconds', 'millis', 'micros', 'tone', 'noTone', 'pulseIn', 'shiftIn', 'shiftOut',
  'attachInterrupt', 'detachInterrupt', 'interrupts', 'noInterrupts', 'map', 'constrain', 'min',
  'max', 'abs', 'random', 'randomSeed', 'bit', 'bitRead', 'bitWrite', 'bitSet', 'bitClear',
  'stfkartBegin', 'main',
  ...['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
]);

function checkIdent(issues, pinId, name, invalidKey) {
  if (!IDENT.test(name)) issues.push({ level: 'error', pins: [pinId], message: t(invalidKey, { pin: pinId, name }) });
  else if (RESERVED.has(name)) issues.push({ level: 'error', pins: [pinId], message: t('issue.nameReserved', { pin: pinId, name }) });
}

// Returns a list of { level: 'error' | 'warning', pins: [...], message }.
export function validate(cfg) {
  cfg = resolve(cfg);
  const issues = [...(cfg.circuitIssues ?? [])];
  const used = Object.entries(cfg.pins);
  const uses = pinUses(cfg);
  const err = (pins, message) => issues.push({ level: 'error', pins, message });
  const warn = (pins, message) => issues.push({ level: 'warning', pins, message });

  for (const [id, p] of used) {
    const pin = PIN_BY_ID[id];
    if (!ROLES[p.role].allowed(pin)) {
      const why = ROLES[p.role].why ? ` ${t(ROLES[p.role].why)}` : '';
      err([id], t('issue.roleNotSupported', { pin: id, role: t(`role.${p.role}`) }) + why);
    }
    if (!p.name) {
      err([id], t('issue.nameMissing', { pin: id }));
    } else {
      checkIdent(issues, id, p.name, 'issue.nameInvalid');
    }
    if (p.role === 'interrupt' && p.handler) checkIdent(issues, id, p.handler, 'issue.handlerInvalid');
  }

  for (const c of cfg.components) {
    const def = COMPONENTS[c.type];
    const compPins = Object.values(c.pins);
    if (!c.name) err(compPins, t('issue.componentNameMissing', { component: def.name }));
    else checkIdent(issues, compPins[0] ?? c.name, c.name, 'issue.nameInvalid');
    for (const { key, label, needs } of def.pins) {
      const id = c.pins[key];
      if (!id) err([], t('issue.componentPinMissing', { name: c.name, label }));
      else if (!pinSupports(id, needs)) err([id], t('issue.componentPinNeeds', { name: c.name, label, pin: id, need: t(`need.${needs}`) }));
    }
    if (def.bus === 'i2c' && !cfg.i2c.enabled) err([], t('issue.needsI2c', { name: c.name }));
  }

  // Duplicate names, including the extra names some roles generate.
  const owners = new Map();
  const own = (n, where) => {
    if (!owners.has(n)) owners.set(n, new Set());
    owners.get(n).add(where);
  };
  for (const [id, p] of used) if (p.name) for (const n of namesForPin(p)) own(n, id);
  for (const c of cfg.components) if (c.name) own(c.name, Object.values(c.pins)[0] ?? c.name);
  for (const [name, where] of owners) {
    if (where.size > 1) err([...where].filter((w) => PIN_BY_ID[w]), t('issue.nameDuplicate', { name, pins: [...where].join(', ') }));
  }

  // One pin, one job.
  const byPin = new Map();
  for (const u of uses) {
    if (!byPin.has(u.pin)) byPin.set(u.pin, []);
    byPin.get(u.pin).push(u);
  }
  for (const [pin, list] of byPin) {
    if (list.length > 1) err([pin], t('issue.pinShared', { pin, users: list.map((u) => u.label).join(', ') }));
  }

  // Shared pins.
  const { serial, i2c, spi } = BOARD.peripherals;
  for (const id of serial.pins) {
    if (!byPin.has(id)) continue;
    if (cfg.serial.enabled) err([id], t('issue.serialPin', { pin: id, label: serial.labels[id] }));
    else warn([id], t('issue.serialShared', { pin: id }));
  }
  if (cfg.i2c.enabled) {
    for (const id of i2c.pins) if (byPin.has(id)) err([id], t('issue.i2cPin', { pin: id, label: i2c.labels[id] }));
  }
  if (cfg.spi.enabled) {
    for (const id of spi.pins) if (byPin.has(id)) err([id], t('issue.spiPin', { pin: id, label: spi.labels[id] }));
    const ss = cfg.pins.D10;
    const ssByComponent = uses.some((u) => u.pin === 'D10' && u.owner !== 'D10');
    if ((ss && !['output', 'led'].includes(ss.role)) || ssByComponent) err(['D10'], t('issue.spiSS'));
  }

  // Timer conflicts between libraries and analogWrite().
  const pwmPins = [
    ...used.filter(([, p]) => p.role === 'pwm').map(([id]) => id),
    ...cfg.components.flatMap((c) => COMPONENTS[c.type].pins.filter((x) => x.needs === 'pwm').map((x) => c.pins[x.key]).filter(Boolean)),
  ];
  const pwmOn = (timer) => pwmPins.filter((id) => PIN_BY_ID[id].timer === timer);
  if (used.some(([, p]) => p.role === 'servo')) {
    const hit = pwmOn(1);
    if (hit.length) warn(hit, t('issue.servoTimer', { pins: hit.join(', ') }));
  }
  const buzzers = used.filter(([, p]) => p.role === 'buzzer').map(([id]) => id);
  if (buzzers.length) {
    const hit = pwmOn(2);
    if (hit.length) warn(hit, t('issue.toneTimer', { pins: hit.join(', ') }));
  }
  if (buzzers.length > 1) warn(buzzers, t('issue.tooManyBuzzers'));

  const d13 = cfg.pins.D13;
  const d13Component = uses.some((u) => u.pin === 'D13' && u.owner !== 'D13');
  if ((d13 && !['led', 'output'].includes(d13.role)) || d13Component) warn(['D13'], t('issue.ledBuiltin'));

  return issues;
}

export function hasErrors(issues) {
  return issues.some((i) => i.level === 'error');
}

// ---------------------------------------------------------------------------
// Code generation

const ROLE_COMMENT = {
  led: 'LED',
  output: 'digital output',
  button: 'button to GND, reads LOW when pressed',
  input: 'digital input',
  pwm: 'PWM output, analogWrite(0-255)',
  analog: 'analog input, analogRead() gives 0-1023',
  servo: 'servo motor',
  interrupt: 'interrupt input',
  buzzer: 'buzzer, use tone()/noTone()',
};

function pinExpr(id) {
  const v = PIN_BY_ID[id].arduino;
  return typeof v === 'number' ? String(v) : v;
}

function orderedPins(cfg) {
  return PINS.filter((p) => cfg.pins[p.id]).map((p) => [p.id, cfg.pins[p.id]]);
}

function pad(s, n) {
  return s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length);
}

export function generate(cfg) {
  cfg = resolve(cfg);
  const pins = orderedPins(cfg);
  const has = (role) => pins.some(([, p]) => p.role === role);
  const H = [];
  const C = [];

  H.push(
    `// ${HEADER_FILE}: generated by STFIDE from ${CONFIG_FILE}.`,
    '// Do not edit this file. Change pins on the Circuit tab instead;',
    '// this file is rewritten every time the pin setup changes.',
    '#pragma once',
    '',
    '#include <Arduino.h>',
  );
  if (has('servo')) H.push('#include <Servo.h>');
  if (cfg.i2c.enabled) H.push('#include <Wire.h>');
  if (cfg.spi.enabled) H.push('#include <SPI.h>');
  const comps = cfg.components.map((c) => ({ c, def: COMPONENTS[c.type] }));
  for (const inc of new Set(comps.flatMap(({ def }) => def.includes ?? []))) H.push(`#include <${inc}>`);
  const helpers = [...new Set(comps.map(({ def }) => def.helper).filter(Boolean))];
  if (helpers.length) {
    H.push('', '// Helper types for components');
    for (const name of helpers) H.push(HELPERS[name].header, '');
    H.pop();
  }

  const consts = pins.filter(([, p]) => p.role !== 'servo');
  if (consts.length) {
    H.push('', '// Pins');
    for (const [id, p] of consts) {
      H.push(pad(`const uint8_t ${p.name} = ${pinExpr(id)};`, 40) + `// ${id}: ${ROLE_COMMENT[p.role]}`);
    }
  }

  const servos = pins.filter(([, p]) => p.role === 'servo');
  if (servos.length) {
    H.push('', '// Servos: use name.write(angle), angle 0-180');
    for (const [id, p] of servos) {
      H.push(pad(`const uint8_t ${p.name}Pin = ${pinExpr(id)};`, 40) + `// ${id}`);
      H.push(`extern Servo ${p.name};`);
    }
  }

  const buttons = pins.filter(([, p]) => p.role === 'button');
  if (buttons.length) {
    H.push('', '// Buttons: true while the button is held down');
    for (const [, p] of buttons) {
      H.push(`inline bool ${p.name}Pressed() { return digitalRead(${p.name}) == LOW; }`);
    }
  }

  if (comps.length) {
    H.push('', '// Components');
    for (const { c, def } of comps) {
      const where = def.bus === 'i2c' ? 'I2C' : def.pins.map((x) => `${x.label} ${c.pins[x.key] ?? '?'}`).join(', ');
      H.push(pad(def.declare(c), 40) + `// ${def.name}: ${where}`);
    }
  }

  const irqs = pins.filter(([, p]) => p.role === 'interrupt');
  if (irqs.length) {
    H.push('', '// Interrupt handlers: write these functions in your sketch.', '// Keep them short, and mark variables they change as volatile.');
    for (const [id, p] of irqs) H.push(pad(`void ${p.handler}();`, 40) + `// runs when ${id} ${p.mode.toLowerCase()}`);
  }

  H.push('', '// Call this once at the start of setup().', 'void stfkartBegin();', '');

  C.push(
    `// ${SOURCE_FILE}: generated by STFIDE from ${CONFIG_FILE}.`,
    '// Do not edit this file. Change pins on the Circuit tab instead.',
    '',
    `#include "${HEADER_FILE}"`,
    '',
  );
  if (servos.length) {
    for (const [, p] of servos) C.push(`Servo ${p.name};`);
    C.push('');
  }
  for (const name of helpers) if (HELPERS[name].source) C.push(HELPERS[name].source, '');
  if (comps.length) {
    for (const { c, def } of comps) C.push(def.define(c, (key) => (c.pins[key] ? pinExpr(c.pins[key]) : '0')));
    C.push('');
  }
  C.push('void stfkartBegin() {');
  const body = [];
  if (cfg.serial.enabled) body.push(`Serial.begin(${Number(cfg.serial.baud) || 9600});`);
  if (cfg.i2c.enabled) {
    body.push('Wire.begin();');
    if (Number(cfg.i2c.clock) !== 100000) body.push(`Wire.setClock(${Number(cfg.i2c.clock)});`);
  }
  for (const [, p] of pins) {
    switch (p.role) {
      case 'led':
      case 'output':
        body.push(`pinMode(${p.name}, OUTPUT);`);
        body.push(`digitalWrite(${p.name}, ${p.initial === 'HIGH' ? 'HIGH' : 'LOW'});`);
        break;
      case 'button':
        body.push(`pinMode(${p.name}, INPUT_PULLUP);`);
        break;
      case 'input':
        body.push(`pinMode(${p.name}, ${p.pullup ? 'INPUT_PULLUP' : 'INPUT'});`);
        break;
      case 'pwm':
        body.push(`pinMode(${p.name}, OUTPUT);`);
        body.push(`analogWrite(${p.name}, ${clamp(p.value, 0, 255)});`);
        break;
      case 'analog':
        break;
      case 'servo':
        body.push(`${p.name}.attach(${p.name}Pin);`);
        body.push(`${p.name}.write(${clamp(p.angle, 0, 180)});`);
        break;
      case 'interrupt':
        body.push(`pinMode(${p.name}, ${p.pullup ? 'INPUT_PULLUP' : 'INPUT'});`);
        body.push(`attachInterrupt(digitalPinToInterrupt(${p.name}), ${p.handler}, ${p.mode});`);
        break;
      case 'buzzer':
        body.push(`pinMode(${p.name}, OUTPUT);`);
        break;
    }
  }
  for (const { c, def } of comps) body.push(...def.begin(c));
  // SPI.begin() last: it reconfigures D10 as an output, after any pinMode above.
  if (cfg.spi.enabled) body.push('SPI.begin();');
  for (const line of body) C.push(`  ${line}`);
  C.push('}', '');

  return { [HEADER_FILE]: H.join('\n'), [SOURCE_FILE]: C.join('\n') };
}

function clamp(v, lo, hi) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

// Short usage snippets shown in the Circuit tab and offered by autocomplete.
export function usageFor(p) {
  switch (p.role) {
    case 'led':
    case 'output':
      return [`digitalWrite(${p.name}, HIGH);`, `digitalWrite(${p.name}, LOW);`];
    case 'button':
      return [`if (${p.name}Pressed()) {\n  \n}`];
    case 'input':
      return [`int value = digitalRead(${p.name});`];
    case 'pwm':
      return [`analogWrite(${p.name}, 128);`];
    case 'analog':
      return [`int value = analogRead(${p.name});`];
    case 'servo':
      return [`${p.name}.write(90);`];
    case 'interrupt':
      return [`void ${p.handler}() {\n  \n}`];
    case 'buzzer':
      return [`tone(${p.name}, 440, 200);`, `noTone(${p.name});`];
    default:
      return [];
  }
}

// Checks the sketch source for interrupt handlers the user has not written yet.
export function missingHandlers(cfg, sources) {
  cfg = resolve(cfg);
  const all = sources.join('\n');
  return Object.values(cfg.pins)
    .filter((p) => p.role === 'interrupt' && p.handler)
    .map((p) => p.handler)
    .filter((fn) => !new RegExp(`\\bvoid\\s+${fn}\\s*\\(\\s*(void)?\\s*\\)\\s*\\{`).test(all));
}

// Everything the Circuit tab puts into the code, for autocomplete and hover:
// [{ name, kind: 'pin' | 'helper' | 'component', detail, usage: [...] }]
export function codeSymbols(cfg) {
  cfg = resolve(cfg);
  const out = [];
  for (const [pinId, p] of Object.entries(cfg.pins)) {
    if (!p.name) continue;
    const detail = `${t(`role.${p.role}`)} on ${pinId}`;
    namesForPin(p).forEach((name, i) => out.push({ name, kind: i === 0 ? 'pin' : 'helper', detail, usage: usageFor(p) }));
  }
  for (const c of cfg.components) {
    if (!c.name) continue;
    const def = COMPONENTS[c.type];
    const where = def.bus === 'i2c' ? 'I2C' : Object.values(c.pins).join(', ');
    out.push({ name: c.name, kind: 'component', detail: `${def.name} on ${where}`, usage: def.usage(c) });
  }
  return out;
}
