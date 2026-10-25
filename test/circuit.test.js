import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addPart, addWire, deriveFromCircuit, emptyCircuit, removePart } from '../src/common/circuit.js';
import { emptyConfig, generate, hasErrors, normalizeConfig, validate } from '../src/common/pins.js';

const root = path.resolve(import.meta.dirname, '..');
const B = (pin) => ({ part: 'board', pin });

function withPart(circuit, type, wiring, name) {
  const r = addPart(circuit, type, 0, 0);
  let c = r.circuit;
  if (name) c.parts.find((p) => p.id === r.part.id).name = name;
  for (const [partPin, end] of Object.entries(wiring)) c = addWire(c, { part: r.part.id, pin: partPin }, end);
  return { circuit: c, id: r.part.id };
}

test('an LED wired to D13 becomes an LED pin', () => {
  const { circuit } = withPart(emptyCircuit(), 'led', { A: B('D13'), C: B('GND.1') });
  const d = deriveFromCircuit(circuit);
  assert.deepEqual(d.pins.map(([pin, role]) => [pin, role.role, role.name]), [['D13', 'led', 'led1']]);
  assert.deepEqual(d.issues, []);
});

test('a resistor in series still connects the LED', () => {
  let { circuit, id: led } = withPart(emptyCircuit(), 'led', {});
  const r = withPart(circuit, 'resistor', { 2: B('D9') });
  circuit = addWire(r.circuit, { part: led, pin: 'A' }, { part: r.id, pin: '1' });
  assert.deepEqual(deriveFromCircuit(circuit).pins.map(([pin]) => pin), ['D9']);
});

test('unwired parts are warnings, shorts are errors', () => {
  let { circuit } = withPart(emptyCircuit(), 'pushbutton', {});
  assert.match(deriveFromCircuit(circuit).issues[0].message, /button1 isn't wired/);
  ({ circuit } = withPart(emptyCircuit(), 'pushbutton', { '1.l': B('D2'), '2.l': B('D3') }));
  const d = deriveFromCircuit(circuit);
  assert.equal(d.issues[0].level, 'error');
  assert.match(d.issues[0].message, /more than one pin \(D2, D3\)/);
});

test('components come from their wired pins', () => {
  const { circuit } = withPart(emptyCircuit(), 'ultrasonic', { TRIG: B('D7'), ECHO: B('D8'), VCC: B('5V'), GND: B('GND.2') });
  const d = deriveFromCircuit(circuit);
  assert.deepEqual(d.components.map((c) => [c.type, c.name, c.pins]), [['ultrasonic', 'distance1', { trig: 'D7', echo: 'D8' }]]);
});

test('LCD must use A4/A5 and turns on I2C', () => {
  let { circuit } = withPart(emptyCircuit(), 'lcd1602', { SDA: B('A4'), SCL: B('A5') });
  let d = deriveFromCircuit(circuit);
  assert.equal(d.i2c, true);
  assert.deepEqual(d.issues, []);
  assert.equal(d.components[0].options.size, '16x2');
  ({ circuit } = withPart(emptyCircuit(), 'lcd1602', { SDA: B('A2'), SCL: B('A5') }));
  d = deriveFromCircuit(circuit);
  assert.match(d.issues[0].message, /wire SDA to A4/);
});

test('two parts on one pin is an error in validate', () => {
  let { circuit } = withPart(emptyCircuit(), 'led', { A: B('D5') });
  ({ circuit } = withPart(circuit, 'buzzer', { 2: B('D5') }));
  const cfg = { ...emptyConfig(), circuit };
  assert.ok(hasErrors(validate(cfg)));
  assert.match(validate(cfg).map((i) => i.message).join('\n'), /D5 is used more than once/);
});

test('removing a part removes its wires', () => {
  const { circuit, id } = withPart(emptyCircuit(), 'led', { A: B('D5'), C: B('GND.1') });
  const next = removePart(circuit, id);
  assert.equal(next.parts.length, 0);
  assert.equal(next.wires.length, 0);
});

test('a pushbutton can use an interrupt', () => {
  const { circuit } = withPart(emptyCircuit(), 'pushbutton', { '1.l': B('D2') }, 'go');
  circuit.parts[0].options.mode = 'interrupt';
  const { 'stfkart_pins.h': hdr, 'stfkart_pins.cpp': src } = generate({ ...emptyConfig(), circuit });
  assert.match(hdr, /void onGo\(\);/);
  assert.match(src, /attachInterrupt\(digitalPinToInterrupt\(go\), onGo, FALLING\);/);
});

// Every example was written before the circuit editor. Migrating it to a
// circuit must not change the generated code.
for (const name of fs.readdirSync(path.join(root, 'examples'))) {
  test(`example ${name} migrates to a circuit with the same code`, () => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'examples', name, 'stfkart.pins.json'), 'utf8'));
    if (raw.circuit) return;
    const before = generate(normalizeConfig({ ...raw, circuit: emptyCircuit() }));
    const migrated = normalizeConfig(raw);
    assert.ok(migrated.circuit.parts.length > 0);
    assert.deepEqual(generate(migrated), before);
    assert.ok(!hasErrors(validate(migrated)), validate(migrated).map((i) => i.message).join('\n'));
    // And it survives a save/load round trip.
    assert.deepEqual(generate(normalizeConfig(JSON.parse(JSON.stringify(migrated)))), before);
  });
}
