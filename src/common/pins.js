// Pin configuration model for the Pins tab: what each role means, how a
// configuration is checked, and the Arduino code generated from it.
//
// A configuration is stored in the sketch folder as stfkart.pins.json:
//   {
//     "version": 1,
//     "pins": { "D13": { "role": "led", "name": "redLed" }, ... },
//     "serial": { "enabled": true, "baud": 9600 },
//     "i2c": { "enabled": false, "clock": 100000 },
//     "spi": { "enabled": false }
//   }
// The generated stfkart_pins.h / stfkart_pins.cpp sit next to it. They are
// always rewritten in full, so the user's own .ino is never touched.

import { BOARD, PINS, PIN_BY_ID } from './board.js';
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
    version: 1,
    pins: {},
    serial: { enabled: true, baud: 9600 },
    i2c: { enabled: false, clock: 100000 },
    spi: { enabled: false },
  };
}

// Fills in missing fields so older or hand-written files still load.
export function normalizeConfig(raw) {
  const base = emptyConfig();
  const cfg = {
    version: 1,
    pins: {},
    serial: { ...base.serial, ...(raw?.serial ?? {}) },
    i2c: { ...base.i2c, ...(raw?.i2c ?? {}) },
    spi: { ...base.spi, ...(raw?.spi ?? {}) },
  };
  for (const [id, p] of Object.entries(raw?.pins ?? {})) {
    if (!PIN_BY_ID[id] || !p || !ROLES[p.role] || p.role === 'unused') continue;
    cfg.pins[id] = { ...ROLES[p.role].defaults, ...p };
  }
  return cfg;
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
  const issues = [];
  const used = Object.entries(cfg.pins);

  for (const [id, p] of used) {
    const pin = PIN_BY_ID[id];
    if (!ROLES[p.role].allowed(pin)) {
      const why = ROLES[p.role].why ? ` ${t(ROLES[p.role].why)}` : '';
      issues.push({ level: 'error', pins: [id], message: t('issue.roleNotSupported', { pin: id, role: t(`role.${p.role}`) }) + why });
    }
    if (!p.name) {
      issues.push({ level: 'error', pins: [id], message: t('issue.nameMissing', { pin: id }) });
    } else {
      checkIdent(issues, id, p.name, 'issue.nameInvalid');
    }
    if (p.role === 'interrupt' && p.handler) checkIdent(issues, id, p.handler, 'issue.handlerInvalid');
  }

  // Duplicate names, including the extra names some roles generate.
  const owners = new Map();
  for (const [id, p] of used) {
    if (!p.name) continue;
    for (const n of namesForPin(p)) {
      if (!owners.has(n)) owners.set(n, new Set());
      owners.get(n).add(id);
    }
  }
  for (const [name, ids] of owners) {
    if (ids.size > 1) issues.push({ level: 'error', pins: [...ids], message: t('issue.nameDuplicate', { name, pins: [...ids].join(', ') }) });
  }

  // Shared pins.
  const { serial, i2c, spi } = BOARD.peripherals;
  for (const id of serial.pins) {
    if (!cfg.pins[id]) continue;
    if (cfg.serial.enabled) issues.push({ level: 'error', pins: [id], message: t('issue.serialPin', { pin: id, label: serial.labels[id] }) });
    else issues.push({ level: 'warning', pins: [id], message: t('issue.serialShared', { pin: id }) });
  }
  if (cfg.i2c.enabled) {
    for (const id of i2c.pins) {
      if (cfg.pins[id]) issues.push({ level: 'error', pins: [id], message: t('issue.i2cPin', { pin: id, label: i2c.labels[id] }) });
    }
  }
  if (cfg.spi.enabled) {
    for (const id of spi.pins) {
      if (cfg.pins[id]) issues.push({ level: 'error', pins: [id], message: t('issue.spiPin', { pin: id, label: spi.labels[id] }) });
    }
    const ss = cfg.pins.D10;
    if (ss && !['output', 'led'].includes(ss.role)) issues.push({ level: 'error', pins: ['D10'], message: t('issue.spiSS') });
  }

  // Timer conflicts between libraries and analogWrite().
  const pwmOn = (timer) => used.filter(([id, p]) => p.role === 'pwm' && PIN_BY_ID[id].timer === timer).map(([id]) => id);
  if (used.some(([, p]) => p.role === 'servo')) {
    const hit = pwmOn(1);
    if (hit.length) issues.push({ level: 'warning', pins: hit, message: t('issue.servoTimer', { pins: hit.join(', ') }) });
  }
  const buzzers = used.filter(([, p]) => p.role === 'buzzer').map(([id]) => id);
  if (buzzers.length) {
    const hit = pwmOn(2);
    if (hit.length) issues.push({ level: 'warning', pins: hit, message: t('issue.toneTimer', { pins: hit.join(', ') }) });
  }
  if (buzzers.length > 1) issues.push({ level: 'warning', pins: buzzers, message: t('issue.tooManyBuzzers') });

  const d13 = cfg.pins.D13;
  if (d13 && !['led', 'output'].includes(d13.role)) issues.push({ level: 'warning', pins: ['D13'], message: t('issue.ledBuiltin') });

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
  const pins = orderedPins(cfg);
  const has = (role) => pins.some(([, p]) => p.role === role);
  const H = [];
  const C = [];

  H.push(
    `// ${HEADER_FILE}: generated by STFIDE from ${CONFIG_FILE}.`,
    '// Do not edit this file. Change pins on the Pins tab instead;',
    '// this file is rewritten every time the pin setup changes.',
    '#pragma once',
    '',
    '#include <Arduino.h>',
  );
  if (has('servo')) H.push('#include <Servo.h>');
  if (cfg.i2c.enabled) H.push('#include <Wire.h>');
  if (cfg.spi.enabled) H.push('#include <SPI.h>');

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

  const irqs = pins.filter(([, p]) => p.role === 'interrupt');
  if (irqs.length) {
    H.push('', '// Interrupt handlers: write these functions in your sketch.', '// Keep them short, and mark variables they change as volatile.');
    for (const [id, p] of irqs) H.push(pad(`void ${p.handler}();`, 40) + `// runs when ${id} ${p.mode.toLowerCase()}`);
  }

  H.push('', '// Call this once at the start of setup().', 'void stfkartBegin();', '');

  C.push(
    `// ${SOURCE_FILE}: generated by STFIDE from ${CONFIG_FILE}.`,
    '// Do not edit this file. Change pins on the Pins tab instead.',
    '',
    `#include "${HEADER_FILE}"`,
    '',
  );
  if (servos.length) {
    for (const [, p] of servos) C.push(`Servo ${p.name};`);
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

// Short usage snippets shown in the Pins tab and offered by autocomplete.
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
  const all = sources.join('\n');
  return Object.values(cfg.pins)
    .filter((p) => p.role === 'interrupt' && p.handler)
    .map((p) => p.handler)
    .filter((fn) => !new RegExp(`\\bvoid\\s+${fn}\\s*\\(\\s*(void)?\\s*\\)\\s*\\{`).test(all));
}
