import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from '../src/common/components.js';
import {
  COMM, COMMON_RESISTORS, PARTS, formatResistance, parseResistance, resistorBands,
} from '../src/common/parts.js';

test('every part names a known communication protocol', () => {
  for (const [type, def] of Object.entries(PARTS)) {
    assert.ok(COMM[def.comm], `${type} has comm ${def.comm}`);
  }
});

test('protocols match how the parts are wired', () => {
  for (const [type, def] of Object.entries(PARTS)) {
    const comp = def.bind?.component && COMPONENTS[def.bind.component];
    const i2c = Boolean(def.bind?.i2c || comp?.bus === 'i2c');
    assert.equal(def.comm === 'i2c', i2c, `${type}: comm ${def.comm}, i2c ${i2c}`);
  }
  for (const type of ['resistor', 'slideSwitch', 'pushbutton', 'led', 'potentiometer', 'buzzer', 'servo', 'relay']) {
    assert.equal(PARTS[type].comm, 'nocomm', type);
  }
  assert.equal(PARTS.ds18b20.comm, 'onewire');
  assert.equal(PARTS.dht22.comm, 'singlewire');
  assert.equal(PARTS.neopixelRing.comm, 'singlewire');
  assert.deepEqual(COMM.nocomm.buses, []);
});

test('resistor values can be typed the usual ways', () => {
  const cases = {
    220: 220, '220R': 220, '4.7k': 4700, '4k7': 4700, '4K7': 4700, '10 kΩ': 10000, '2,2k': 2200,
    '47 ohm': 47, '1M': 1e6, '1M5': 1.5e6, '0.1': 0.1, '4.75k': 4800,
  };
  for (const [text, ohms] of Object.entries(cases)) assert.equal(parseResistance(text), ohms, text);
  for (const bad of ['', 'abc', '0', '-10', '4.7k7', '1k k', '1000000000', '47 ohmz']) {
    assert.equal(parseResistance(bad), null, bad);
  }
});

test('resistor values are shown short', () => {
  assert.equal(formatResistance(220), '220');
  assert.equal(formatResistance(4700), '4.7k');
  assert.equal(formatResistance(10000), '10k');
  assert.equal(formatResistance(1.5e6), '1.5M');
  for (const v of COMMON_RESISTORS) assert.equal(parseResistance(formatResistance(v)), v);
});

test('color bands follow the standard code', () => {
  assert.deepEqual(resistorBands(220), [2, 2, 1]); // red red brown
  assert.deepEqual(resistorBands(4700), [4, 7, 2]); // yellow violet red
  assert.deepEqual(resistorBands(10000), [1, 0, 3]); // brown black orange
  assert.deepEqual(resistorBands(10), [1, 0, 0]); // brown black black
  assert.deepEqual(resistorBands(4.7), [4, 7, -1]); // gold multiplier
  assert.deepEqual(resistorBands(1e6), [1, 0, 5]);
});
