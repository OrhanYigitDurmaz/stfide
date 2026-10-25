import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, allComponentLibraries } from '../src/common/components.js';
import {
  addComponent, assignRole, codeSymbols, emptyConfig, freePinsFor, generate, hasErrors, normalizeConfig, removeComponent, validate,
} from '../src/common/pins.js';

const messages = (cfg) => validate(cfg).map((i) => `${i.level}: ${i.message}`).join('\n');

test('adding a component picks free pins that fit', () => {
  let cfg = assignRole(emptyConfig(), 'D2', 'led');
  cfg = addComponent(cfg, 'ultrasonic');
  const c = cfg.components[0];
  assert.equal(c.name, 'distance');
  assert.equal(c.pins.trig, 'D3');
  assert.equal(c.pins.echo, 'D4');
  cfg = addComponent(cfg, 'rgbLed');
  assert.deepEqual(cfg.components[1].pins, { red: 'D5', green: 'D6', blue: 'D9' });
  assert.deepEqual(validate(cfg), []);
});

test('second component of a type gets a new name', () => {
  let cfg = addComponent(emptyConfig(), 'relay');
  cfg = addComponent(cfg, 'relay');
  assert.deepEqual(cfg.components.map((c) => c.name), ['relay', 'relay2']);
  assert.notEqual(cfg.components[0].id, cfg.components[1].id);
  cfg = removeComponent(cfg, cfg.components[0].id);
  assert.deepEqual(cfg.components.map((c) => c.name), ['relay2']);
});

test('I2C components turn on I2C and complain when it is off', () => {
  let cfg = addComponent(emptyConfig(), 'lcd');
  assert.equal(cfg.i2c.enabled, true);
  assert.ok(!hasErrors(validate(cfg)));
  cfg.i2c.enabled = false;
  assert.match(messages(cfg), /lcd talks over I2C/);
});

test('a pin used by a component and a role is an error', () => {
  let cfg = addComponent(emptyConfig(), 'dht');
  cfg = assignRole(cfg, cfg.components[0].pins.data, 'led');
  assert.match(messages(cfg), /error: D2 is used more than once/);
});

test('component pins must support what they need', () => {
  const cfg = normalizeConfig({ components: [{ id: 'c1', type: 'rgbLed', name: 'rgb', pins: { red: 'D4', green: 'D5', blue: 'D6' } }] });
  assert.match(messages(cfg), /rgb: Red on D4 needs a PWM pin/);
  assert.ok(!freePinsFor(cfg, 'pwm').includes('D4'));
});

test('component names clash with pin names', () => {
  let cfg = addComponent(emptyConfig(), 'relay');
  cfg = assignRole(cfg, 'D8', 'led');
  cfg.pins.D8.name = 'relay';
  assert.match(messages(cfg), /"relay" is used for more than one pin/);
});

test('generated code for every component', () => {
  let cfg = emptyConfig();
  for (const type of Object.keys(COMPONENTS)) cfg = addComponent(cfg, type);
  assert.ok(!hasErrors(validate(cfg)), messages(cfg));
  const { 'stfkart_pins.h': hdr, 'stfkart_pins.cpp': src } = generate(cfg);
  for (const inc of ['DHT.h', 'OneWire.h', 'DallasTemperature.h', 'LiquidCrystal_I2C.h', 'Adafruit_NeoPixel.h', 'Wire.h']) {
    assert.match(hdr, new RegExp(`#include <${inc}>`));
  }
  assert.match(hdr, /class StfUltrasonic/);
  assert.match(hdr, /extern DHT climate;/);
  assert.match(src, /DHT climate\(\d+, DHT11\);/);
  assert.match(src, /LiquidCrystal_I2C lcd\(0x27, 16, 2\);/);
  assert.match(src, /Adafruit_NeoPixel strip\(8, \d+, NEO_GRB \+ NEO_KHZ800\);/);
  assert.match(src, /StfRelay relay\(\d+, LOW\);/);
  assert.match(src, /lcd.init\(\);\n {2}lcd.backlight\(\);/);
  const names = codeSymbols(cfg).map((s) => s.name);
  assert.deepEqual(names.sort(), ['climate', 'distance', 'lcd', 'probe', 'relay', 'rgb', 'strip']);
});

test('component libraries are listed for bundling', () => {
  assert.deepEqual(allComponentLibraries().sort(), [
    'Adafruit NeoPixel@1.12.3', 'Adafruit Unified Sensor@1.1.14', 'DHT sensor library@1.4.6',
    'DallasTemperature@4.0.4', 'LiquidCrystal I2C@1.1.2', 'OneWire@2.3.8',
  ]);
});
