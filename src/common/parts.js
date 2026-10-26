// Parts that can be placed on the circuit canvas. The drawings come from
// @wokwi/elements; this file says what each part means for the code.
//
// bind:
//   { role, signal }        a single-pin role (see ROLES in pins.js); `signal`
//                           lists the part pins that may carry the signal
//   { component, pins }     a component (see components.js); `pins` maps the
//                           component's pin keys to part pin names
//   passthrough: [a, b]     the part connects pins a and b (resistors), so a
//                           part wired through it still reaches the board
// options: shown in the inspector. `attr` also sets that attribute on the
// drawing; `role`/`component` options are passed to the generated code.

import { tx } from './i18n.js';

export const PARTS = {
  led: {
    label: 'LED',
    tag: 'wokwi-led',
    prefix: 'led',
    bind: { role: 'led', signal: ['A'] },
    options: [
      { key: 'color', label: 'Color', choices: ['red', 'green', 'blue', 'yellow', 'orange', 'white'], default: 'red', attr: 'color' },
      { key: 'initial', label: 'Starts', choices: ['LOW', 'HIGH'], default: 'LOW', role: true },
      { key: 'brightness', label: 'Brightness control', choices: ['On/off', 'Dimmable (PWM)'], default: 'On/off' },
    ],
    hint: 'Long leg (A) to a pin, short leg (C) to GND through a resistor. Dimmable LEDs need a PWM pin (~).',
  },
  pushbutton: {
    label: 'Push button',
    tag: 'wokwi-pushbutton',
    prefix: 'button',
    bind: { role: 'button', signal: ['1.l', '1.r', '2.l', '2.r'] },
    options: [
      { key: 'color', label: 'Color', choices: ['green', 'red', 'blue', 'yellow', 'black', 'white'], default: 'green', attr: 'color' },
      { key: 'mode', label: 'Read with', choices: ['Pressed()', 'interrupt'], default: 'Pressed()' },
    ],
    hint: 'One side to a pin, the other side to GND. No resistor needed.',
  },
  potentiometer: {
    label: 'Potentiometer',
    tag: 'wokwi-potentiometer',
    prefix: 'knob',
    bind: { role: 'analog', signal: ['SIG'] },
    hint: 'SIG to A0–A5, VCC to 5V, GND to GND.',
  },
  photoresistor: {
    label: 'Light sensor (LDR module)',
    tag: 'wokwi-photoresistor-sensor',
    prefix: 'light',
    bind: { role: 'analog', signal: ['AO'] },
    hint: 'AO to A0–A5.',
  },
  pir: {
    label: 'Motion sensor (PIR)',
    tag: 'wokwi-pir-motion-sensor',
    prefix: 'motion',
    bind: { role: 'input', signal: ['OUT'] },
    hint: 'OUT goes HIGH while motion is detected.',
  },
  slideSwitch: {
    label: 'Slide switch',
    tag: 'wokwi-slide-switch',
    prefix: 'switch',
    bind: { role: 'input', signal: ['2'], pullup: true },
    hint: 'Middle pin to a pin, one side pin to GND.',
  },
  buzzer: {
    label: 'Buzzer',
    tag: 'wokwi-buzzer',
    prefix: 'buzzer',
    bind: { role: 'buzzer', signal: ['2', '1'] },
    hint: 'One pin to a digital pin, the other to GND.',
  },
  servo: {
    label: 'Servo motor',
    tag: 'wokwi-servo',
    prefix: 'servo',
    bind: { role: 'servo', signal: ['PWM'] },
    options: [{ key: 'angle', label: 'Start angle (°)', type: 'number', min: 0, max: 180, default: 90, role: true }],
    hint: 'PWM (orange) to a pin, V+ to 5V, GND to GND.',
  },
  ultrasonic: {
    label: 'Ultrasonic sensor (HC-SR04)',
    tag: 'wokwi-hc-sr04',
    prefix: 'distance',
    bind: { component: 'ultrasonic', pins: { trig: 'TRIG', echo: 'ECHO' } },
    hint: 'TRIG and ECHO to two digital pins.',
  },
  dht22: {
    label: 'Temperature & humidity (DHT22)',
    tag: 'wokwi-dht22',
    prefix: 'climate',
    bind: { component: 'dht', pins: { data: 'SDA' }, options: { model: 'DHT22' } },
    options: [{ key: 'model', label: 'Model', choices: ['DHT22', 'DHT11'], default: 'DHT22', component: true }],
    hint: 'SDA (data) to a digital pin.',
  },
  ds18b20: {
    label: 'Temperature probe (DS18B20)',
    tag: 'stf-module',
    attrs: { label: 'DS18B20', pins: 'GND,DQ,VDD' },
    prefix: 'probe',
    bind: { component: 'ds18b20', pins: { data: 'DQ' } },
    hint: 'DQ to a digital pin, VDD to 5V, GND to GND. Needs a 4.7 kΩ resistor from DQ to 5V.',
  },
  lcd1602: {
    label: 'LCD 16×2 (I2C)',
    tag: 'wokwi-lcd1602',
    attrs: { pins: 'i2c' },
    prefix: 'lcd',
    bind: { component: 'lcd', pins: {}, i2c: { SDA: 'A4', SCL: 'A5' }, options: { size: '16x2' } },
    options: [{ key: 'address', label: 'I2C address', choices: ['0x27', '0x3F'], default: '0x27', component: true }],
    hint: 'SDA to A4, SCL to A5.',
  },
  lcd2004: {
    label: 'LCD 20×4 (I2C)',
    tag: 'wokwi-lcd2004',
    attrs: { pins: 'i2c' },
    prefix: 'lcd',
    bind: { component: 'lcd', pins: {}, i2c: { SDA: 'A4', SCL: 'A5' }, options: { size: '20x4' } },
    options: [{ key: 'address', label: 'I2C address', choices: ['0x27', '0x3F'], default: '0x27', component: true }],
    hint: 'SDA to A4, SCL to A5.',
  },
  neopixelRing: {
    label: 'NeoPixel ring',
    tag: 'wokwi-led-ring',
    prefix: 'ring',
    bind: { component: 'neopixel', pins: { data: 'DIN' } },
    options: [{ key: 'count', label: 'Number of LEDs', choices: ['8', '12', '16', '24'], default: '12', attr: 'pixels', component: true }],
    hint: 'DIN to a digital pin.',
  },
  rgbLed: {
    label: 'RGB LED',
    tag: 'wokwi-rgb-led',
    prefix: 'rgb',
    bind: { component: 'rgbLed', pins: { red: 'R', green: 'G', blue: 'B' } },
    options: [{ key: 'type', label: 'Type', choices: ['Common cathode', 'Common anode'], default: 'Common cathode', component: true }],
    hint: 'R, G and B to PWM pins (~), COM to GND (or 5V for common anode).',
  },
  relay: {
    label: 'Relay',
    tag: 'wokwi-ks2e-m-dc5',
    prefix: 'relay',
    bind: { component: 'relay', pins: { in: 'COIL1' }, options: { trigger: 'HIGH' } },
    hint: 'COIL1 to a digital pin, COIL2 to GND.',
  },
  resistor: {
    label: 'Resistor',
    tag: 'wokwi-resistor',
    prefix: 'r',
    passthrough: ['1', '2'],
    options: [{ key: 'value', label: 'Value (Ω)', choices: ['220', '330', '1000', '10000'], default: '220', attr: 'value' }],
  },
};

export const BOARD_PART = 'board';

export function defaultOptions(type) {
  const out = {};
  for (const o of PARTS[type].options ?? []) out[o.key] = o.default;
  return out;
}

// Translated display text; the English above is the fallback.
export const partLabel = (type) => tx(`part.${type}`, PARTS[type].label);
export const partHint = (type) => tx(`hint.${type}`, PARTS[type].hint ?? '');
export const optionLabel = (o) => tx(`option.${o.key}`, o.label);
