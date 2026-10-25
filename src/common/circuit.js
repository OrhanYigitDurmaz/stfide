// The circuit drawn on the Circuit tab, and how it turns into pin setup.
//
//   circuit = {
//     board: { x, y },
//     parts: [{ id, type, name, x, y, rotate, options }],
//     wires: [{ id, from: { part, pin }, to: { part, pin }, color, points: [[x, y], ...] }],
//   }
//
// Wire endpoints on the board use part 'board' and the header pin name
// (D13, A0, GND.1, 5V...). Connected endpoints form nets; resistors join
// their two pins, so an LED wired through a resistor still reaches its pin.

import { BOARD_GEOMETRY, PIN_BY_ID, isSignalPin } from './board.js';
import { COMPONENTS } from './components.js';
import { BOARD_PART, PARTS, defaultOptions } from './parts.js';
import { t } from './i18n.js';

export function emptyCircuit() {
  return { board: { x: 0, y: 0 }, parts: [], wires: [] };
}

export function normalizeCircuit(raw) {
  const c = emptyCircuit();
  if (raw?.board) c.board = { x: Number(raw.board.x) || 0, y: Number(raw.board.y) || 0 };
  const ids = new Set([BOARD_PART]);
  for (const p of raw?.parts ?? []) {
    if (!PARTS[p?.type] || !p.id || ids.has(p.id)) continue;
    ids.add(p.id);
    c.parts.push({
      id: String(p.id),
      type: p.type,
      name: String(p.name ?? ''),
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      rotate: [0, 90, 180, 270].includes(p.rotate) ? p.rotate : 0,
      options: { ...defaultOptions(p.type), ...(p.options ?? {}) },
    });
  }
  for (const w of raw?.wires ?? []) {
    if (!w?.from?.part || !w?.to?.part || !ids.has(w.from.part) || !ids.has(w.to.part)) continue;
    c.wires.push({
      id: String(w.id),
      from: { part: w.from.part, pin: String(w.from.pin) },
      to: { part: w.to.part, pin: String(w.to.pin) },
      color: w.color || 'green',
      points: Array.isArray(w.points) ? w.points.filter((pt) => Array.isArray(pt) && pt.length === 2).map(([x, y]) => [Number(x), Number(y)]) : [],
    });
  }
  return c;
}

const key = (part, pin) => `${part}:${pin}`;

// Union-find over wire endpoints. Returns a function giving the set of
// endpoints connected to a given endpoint.
export function nets(circuit) {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    parent.set(a, r);
    return r;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const w of circuit.wires) union(key(w.from.part, w.from.pin), key(w.to.part, w.to.pin));
  for (const p of circuit.parts) {
    const through = PARTS[p.type].passthrough;
    if (through) union(key(p.id, through[0]), key(p.id, through[1]));
  }
  const groups = new Map();
  for (const a of parent.keys()) {
    const r = find(a);
    if (!groups.has(r)) groups.set(r, new Set());
    groups.get(r).add(a);
  }
  return (part, pin) => groups.get(find(key(part, pin))) ?? new Set([key(part, pin)]);
}

// Board signal pins (D0..D13, A0..A5) reachable from a part pin.
function boardPinsOf(netOf, part, pin) {
  return [...netOf(part, pin)]
    .filter((k) => k.startsWith(`${BOARD_PART}:`))
    .map((k) => k.slice(BOARD_PART.length + 1))
    .filter(isSignalPin);
}

function handlerName(name) {
  return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// Turns the circuit into pin roles and components.
// Returns { pins: [[pinId, role]...], components: [...], issues: [...], i2c: bool }.
export function deriveFromCircuit(circuit) {
  const netOf = nets(circuit);
  const out = { pins: [], components: [], issues: [], i2c: false };
  const warn = (pins, message) => out.issues.push({ level: 'warning', pins, message });
  const err = (pins, message) => out.issues.push({ level: 'error', pins, message });

  for (const part of circuit.parts) {
    const def = PARTS[part.type];
    const bind = def.bind;
    if (!bind) continue;
    const name = part.name || '?';

    if (bind.role) {
      const found = [];
      for (const sig of bind.signal) {
        for (const pin of boardPinsOf(netOf, part.id, sig)) if (!found.includes(pin)) found.push(pin);
      }
      if (!found.length) {
        warn([], t('circuit.notWired', { name, hint: def.hint ?? '' }));
        continue;
      }
      if (found.length > 1) err(found, t('circuit.shorted', { name, pins: found.join(', ') }));
      const role = { role: bind.role, name: part.name };
      for (const o of def.options ?? []) if (o.role) role[o.key] = part.options[o.key];
      if (bind.pullup) role.pullup = true;
      if (part.type === 'led' && part.options.brightness === 'Dimmable (PWM)') {
        Object.assign(role, { role: 'pwm', value: part.options.value ?? 0 });
        delete role.initial;
      }
      if (part.type === 'pushbutton' && part.options.mode === 'interrupt') {
        Object.assign(role, { role: 'interrupt', mode: 'FALLING', pullup: true, handler: handlerName(part.name) });
      }
      out.pins.push([found[0], role, part.id]);
      continue;
    }

    const comp = COMPONENTS[bind.component];
    const pins = {};
    for (const [compKey, partPin] of Object.entries(bind.pins)) {
      const found = boardPinsOf(netOf, part.id, partPin);
      if (found.length === 1) pins[compKey] = found[0];
      else if (found.length > 1) err(found, t('circuit.shorted', { name, pins: found.join(', ') }));
      else warn([], t('circuit.pinNotWired', { name, pin: partPin }));
    }
    if (bind.i2c) {
      out.i2c = true;
      for (const [partPin, boardPin] of Object.entries(bind.i2c)) {
        const found = boardPinsOf(netOf, part.id, partPin);
        if (!found.includes(boardPin)) {
          (found.length ? err : warn)(found, t('circuit.i2cWire', { name, pin: partPin, board: boardPin }));
        }
      }
    }
    const options = { ...(bind.options ?? {}) };
    for (const o of def.options ?? []) if (o.component) options[o.key] = part.options[o.key];
    for (const o of comp.options ?? []) if (options[o.key] === undefined) options[o.key] = o.default;
    if (Object.keys(pins).length === Object.keys(bind.pins).length) {
      out.components.push({ id: part.id, type: bind.component, name: part.name, pins, options });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Editing helpers. All return a new circuit.

function nextId(list, prefix) {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addPart(circuit, type, x, y, takenNames = new Set()) {
  const next = structuredClone(circuit);
  const def = PARTS[type];
  const names = new Set([...takenNames, ...next.parts.map((p) => p.name)]);
  let n = 1;
  while (names.has(`${def.prefix}${n}`)) n++;
  const part = { id: nextId(next.parts, 'p'), type, name: `${def.prefix}${n}`, x, y, rotate: 0, options: defaultOptions(type) };
  next.parts.push(part);
  return { circuit: next, part };
}

export function removePart(circuit, id) {
  const next = structuredClone(circuit);
  next.parts = next.parts.filter((p) => p.id !== id);
  next.wires = next.wires.filter((w) => w.from.part !== id && w.to.part !== id);
  return next;
}

export function addWire(circuit, from, to, points = [], color = 'green') {
  const next = structuredClone(circuit);
  const same = (a, b) => a.part === b.part && a.pin === b.pin;
  if (same(from, to)) return next;
  if (next.wires.some((w) => (same(w.from, from) && same(w.to, to)) || (same(w.from, to) && same(w.to, from)))) return next;
  next.wires.push({ id: nextId(next.wires, 'w'), from, to, color, points });
  return next;
}

export function removeWire(circuit, id) {
  const next = structuredClone(circuit);
  next.wires = next.wires.filter((w) => w.id !== id);
  return next;
}

// Picks a wire color from what it connects, like breadboard conventions.
export function wireColorFor(from, to) {
  const pins = [from, to].filter((e) => e.part === BOARD_PART).map((e) => e.pin);
  if (pins.some((p) => p.startsWith('GND'))) return 'black';
  if (pins.some((p) => ['5V', '3V3', 'VIN'].includes(p))) return 'red';
  return 'green';
}

// ---------------------------------------------------------------------------
// Migration: older sketches stored pins and components without a circuit.
// Roles and components that have a matching part become parts wired to
// their pins; the rest stay as plain pin settings.

const ROLE_PART = { led: 'led', pwm: 'led', button: 'pushbutton', interrupt: 'pushbutton', analog: 'potentiometer', servo: 'servo', buzzer: 'buzzer' };
const COMPONENT_PART = { ds18b20: 'ds18b20', ultrasonic: 'ultrasonic', dht: 'dht22', lcd: 'lcd1602', neopixel: 'neopixelRing', rgbLed: 'rgbLed', relay: 'relay' };
// Power wiring added for migrated parts so the drawing looks complete.
const POWER = {
  led: { C: 'GND.1' },
  pushbutton: { '2.l': 'GND.1' },
  potentiometer: { VCC: '5V', GND: 'GND.2' },
  servo: { 'V+': '5V', GND: 'GND.2' },
  buzzer: { 1: 'GND.1' },
  ultrasonic: { VCC: '5V', GND: 'GND.3' },
  dht22: { VCC: '5V', GND: 'GND.3' },
  ds18b20: { VDD: '5V', GND: 'GND.3' },
  lcd1602: { VCC: '5V', GND: 'GND.3', SDA: 'A4', SCL: 'A5' },
  lcd2004: { VCC: '5V', GND: 'GND.3', SDA: 'A4', SCL: 'A5' },
  neopixelRing: { VCC: '5V', GND: 'GND.3' },
  rgbLed: { COM: 'GND.1' },
  relay: { COIL2: 'GND.1' },
};

export function migrateToCircuit(pins, components) {
  let circuit = emptyCircuit();
  const keptPins = {};
  const keptComponents = [];
  const above = [];
  const below = [];
  const side = [];
  const place = (type, pinIds) => {
    const xs = pinIds.map((id) => BOARD_GEOMETRY.pins[id]?.x ?? 0);
    const x = xs.length ? Math.min(...xs) : 0;
    const top = pinIds.every((id) => (BOARD_GEOMETRY.pins[id]?.y ?? 0) < 100);
    if (!pinIds.length || type === 'lcd1602' || type === 'neopixelRing') {
      side.push(type);
      return { x: BOARD_GEOMETRY.width + 60, y: (side.length - 1) * 140 };
    }
    const lane = top ? above : below;
    lane.push(x);
    const n = lane.filter((v) => Math.abs(v - x) < 60).length - 1;
    return top ? { x: x - 15 - n * 30, y: -150 - n * 10 } : { x: x - 20 + n * 70, y: BOARD_GEOMETRY.height + 60 };
  };
  const wire = (part, partPin, boardPin) => {
    const from = { part, pin: partPin };
    const to = { part: BOARD_PART, pin: boardPin };
    circuit = addWire(circuit, from, to, [], wireColorFor(from, to));
  };
  const addMigrated = (type, name, options, signalWiring) => {
    const at = place(type, Object.values(signalWiring));
    const r = addPart(circuit, type, at.x, at.y);
    circuit = r.circuit;
    const part = circuit.parts.find((p) => p.id === r.part.id);
    part.name = name;
    Object.assign(part.options, options);
    for (const [partPin, boardPin] of Object.entries(signalWiring)) wire(part.id, partPin, boardPin);
    for (const [partPin, boardPin] of Object.entries(POWER[type] ?? {})) wire(part.id, partPin, boardPin);
  };

  for (const [pinId, p] of Object.entries(pins)) {
    const type = ROLE_PART[p.role];
    const usable = type && !(p.role === 'analog' && !PIN_BY_ID[pinId]?.analog);
    if (!usable) {
      keptPins[pinId] = p;
      continue;
    }
    const signal = PARTS[type].bind.signal[0];
    const options = {};
    if (p.role === 'led' && p.initial) options.initial = p.initial;
    if (p.role === 'pwm') Object.assign(options, { brightness: 'Dimmable (PWM)', value: p.value ?? 0 });
    if (p.role === 'servo' && p.angle !== undefined) options.angle = p.angle;
    if (p.role === 'interrupt') {
      // Only the default handler name survives as a part; keep custom setups as pins.
      if (p.handler !== handlerName(p.name) || p.mode !== 'FALLING' || p.pullup === false) {
        keptPins[pinId] = p;
        continue;
      }
      options.mode = 'interrupt';
    }
    addMigrated(type, p.name, options, { [signal]: pinId });
  }
  for (const c of components) {
    const type = COMPONENT_PART[c.type];
    if (!type) {
      keptComponents.push(c);
      continue;
    }
    const bind = PARTS[type].bind;
    const wiring = {};
    for (const [compKey, partPin] of Object.entries(bind.pins)) if (c.pins[compKey]) wiring[partPin] = c.pins[compKey];
    const options = {};
    for (const o of PARTS[type].options ?? []) if (o.component && c.options?.[o.key] !== undefined) options[o.key] = String(c.options[o.key]);
    const partType = c.type === 'lcd' && c.options?.size === '20x4' ? 'lcd2004' : type;
    addMigrated(partType, c.name, options, wiring);
  }
  return { circuit, pins: keptPins, components: keptComponents };
}
