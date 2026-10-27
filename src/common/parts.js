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
// comm: the communication protocol the part talks (see COMM). 'nocomm'
//   parts are plain pin signals (on/off, analog, PWM, pulses), so the
//   inspector shows no bus settings (UART, I2C, SPI) for them.
// options: shown in the inspector. `attr` also sets that attribute on the
// drawing; `role`/`component` options are passed to the generated code.
// type: 'resistance' is a free value in ohms ("4.7k", "10k", "1M").

import { tx } from './i18n.js';

export const PARTS = {
  led: {
    label: 'LED',
    comm: 'nocomm',
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
    comm: 'nocomm',
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
    comm: 'nocomm',
    tag: 'wokwi-potentiometer',
    prefix: 'knob',
    bind: { role: 'analog', signal: ['SIG'] },
    hint: 'SIG to A0–A5, VCC to 5V, GND to GND.',
  },
  photoresistor: {
    label: 'Light sensor (LDR module)',
    comm: 'nocomm',
    tag: 'wokwi-photoresistor-sensor',
    prefix: 'light',
    bind: { role: 'analog', signal: ['AO'] },
    hint: 'AO to A0–A5.',
  },
  pir: {
    label: 'Motion sensor (PIR)',
    comm: 'nocomm',
    tag: 'wokwi-pir-motion-sensor',
    prefix: 'motion',
    bind: { role: 'input', signal: ['OUT'] },
    hint: 'OUT goes HIGH while motion is detected.',
  },
  slideSwitch: {
    label: 'Slide switch',
    comm: 'nocomm',
    tag: 'wokwi-slide-switch',
    prefix: 'switch',
    bind: { role: 'input', signal: ['2'], pullup: true },
    hint: 'Middle pin to a pin, one side pin to GND.',
  },
  buzzer: {
    label: 'Buzzer',
    comm: 'nocomm',
    tag: 'wokwi-buzzer',
    prefix: 'buzzer',
    bind: { role: 'buzzer', signal: ['2', '1'] },
    hint: 'One pin to a digital pin, the other to GND.',
  },
  servo: {
    label: 'Servo motor',
    comm: 'nocomm',
    tag: 'wokwi-servo',
    prefix: 'servo',
    bind: { role: 'servo', signal: ['PWM'] },
    options: [{ key: 'angle', label: 'Start angle (°)', type: 'number', min: 0, max: 180, default: 90, role: true }],
    hint: 'PWM (orange) to a pin, V+ to 5V, GND to GND.',
  },
  ultrasonic: {
    label: 'Ultrasonic sensor (HC-SR04)',
    comm: 'nocomm',
    tag: 'wokwi-hc-sr04',
    prefix: 'distance',
    bind: { component: 'ultrasonic', pins: { trig: 'TRIG', echo: 'ECHO' } },
    hint: 'TRIG and ECHO to two digital pins.',
  },
  dht22: {
    label: 'Temperature & humidity (DHT22)',
    comm: 'singlewire',
    tag: 'wokwi-dht22',
    prefix: 'climate',
    bind: { component: 'dht', pins: { data: 'SDA' }, options: { model: 'DHT22' } },
    options: [{ key: 'model', label: 'Model', choices: ['DHT22', 'DHT11'], default: 'DHT22', component: true }],
    hint: 'SDA (data) to a digital pin.',
  },
  ds18b20: {
    label: 'Temperature probe (DS18B20)',
    comm: 'onewire',
    tag: 'stf-module',
    attrs: { label: 'DS18B20', pins: 'GND,DQ,VDD' },
    prefix: 'probe',
    bind: { component: 'ds18b20', pins: { data: 'DQ' } },
    hint: 'DQ to a digital pin, VDD to 5V, GND to GND. Needs a 4.7 kΩ resistor from DQ to 5V.',
  },
  lcd1602: {
    label: 'LCD 16×2 (I2C)',
    comm: 'i2c',
    tag: 'wokwi-lcd1602',
    attrs: { pins: 'i2c' },
    prefix: 'lcd',
    bind: { component: 'lcd', pins: {}, i2c: { SDA: 'A4', SCL: 'A5' }, options: { size: '16x2' } },
    options: [{ key: 'address', label: 'I2C address', choices: ['0x27', '0x3F'], default: '0x27', component: true }],
    hint: 'SDA to A4, SCL to A5.',
  },
  lcd2004: {
    label: 'LCD 20×4 (I2C)',
    comm: 'i2c',
    tag: 'wokwi-lcd2004',
    attrs: { pins: 'i2c' },
    prefix: 'lcd',
    bind: { component: 'lcd', pins: {}, i2c: { SDA: 'A4', SCL: 'A5' }, options: { size: '20x4' } },
    options: [{ key: 'address', label: 'I2C address', choices: ['0x27', '0x3F'], default: '0x27', component: true }],
    hint: 'SDA to A4, SCL to A5.',
  },
  neopixelRing: {
    label: 'NeoPixel ring',
    comm: 'singlewire',
    tag: 'wokwi-led-ring',
    prefix: 'ring',
    bind: { component: 'neopixel', pins: { data: 'DIN' } },
    options: [{ key: 'count', label: 'Number of LEDs', choices: ['8', '12', '16', '24'], default: '12', attr: 'pixels', component: true }],
    hint: 'DIN to a digital pin.',
  },
  rgbLed: {
    label: 'RGB LED',
    comm: 'nocomm',
    tag: 'wokwi-rgb-led',
    prefix: 'rgb',
    bind: { component: 'rgbLed', pins: { red: 'R', green: 'G', blue: 'B' } },
    options: [{ key: 'type', label: 'Type', choices: ['Common cathode', 'Common anode'], default: 'Common cathode', component: true }],
    hint: 'R, G and B to PWM pins (~), COM to GND (or 5V for common anode).',
  },
  relay: {
    label: 'Relay',
    comm: 'nocomm',
    tag: 'wokwi-ks2e-m-dc5',
    prefix: 'relay',
    bind: { component: 'relay', pins: { in: 'COIL1' }, options: { trigger: 'HIGH' } },
    hint: 'COIL1 to a digital pin, COIL2 to GND.',
  },
  resistor: {
    label: 'Resistor',
    comm: 'nocomm',
    tag: 'wokwi-resistor',
    prefix: 'r',
    passthrough: ['1', '2'],
    options: [{ key: 'value', label: 'Value (Ω)', type: 'resistance', default: '220', attr: 'value' }],
    hint: 'Type any value, like 220, 4.7k or 1M. The color bands follow it.',
  },
};

// Communication protocols. `buses` are the board buses (keys of the config's
// serial/i2c/spi settings) the part needs; only those are shown while it is
// selected.
export const COMM = {
  nocomm: { label: 'None, plain pin signal', buses: [] },
  i2c: { label: 'I2C', buses: ['i2c'] },
  spi: { label: 'SPI', buses: ['spi'] },
  uart: { label: 'UART (Serial)', buses: ['serial'] },
  onewire: { label: '1-Wire', buses: [] },
  singlewire: { label: 'Single-wire data (library handles it)', buses: [] },
};

export const BOARD_PART = 'board';

// ---- resistor values ---------------------------------------------------

export const RESISTANCE_MIN = 0.1;
export const RESISTANCE_MAX = 100e6;
export const COMMON_RESISTORS = [10, 22, 47, 100, 220, 330, 470, 1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 1e6];

// "220", "220R", "4.7k", "4k7", "10 kΩ", "1M" -> ohms, rounded to the two
// digits a 4-band resistor can show. null when it isn't a usable value.
export function parseResistance(text) {
  const m = String(text ?? '').trim().replace(',', '.').replace(/\s*(Ω|ohms?)$/i, '')
    .match(/^(\d+(?:\.\d+)?)\s*([rkm])?(\d*)$/i);
  if (!m) return null;
  const [, num, unit = '', tail] = m;
  if (tail && (!unit || num.includes('.'))) return null;
  const mult = { '': 1, r: 1, k: 1e3, m: 1e6 }[unit.toLowerCase()];
  const ohms = Number(Number(`${num}${tail ? `.${tail}` : ''}` * mult).toPrecision(2));
  return ohms >= RESISTANCE_MIN && ohms <= RESISTANCE_MAX ? ohms : null;
}

// 4700 -> "4.7k"
export function formatResistance(ohms) {
  const n = Number(ohms);
  const short = (v) => String(Number(v.toPrecision(3)));
  if (n >= 1e6) return `${short(n / 1e6)}M`;
  if (n >= 1e3) return `${short(n / 1e3)}k`;
  return short(n);
}

// The color code: [first digit, second digit, multiplier exponent], where
// -1 is gold and -2 silver. Same math as the wokwi-resistor drawing.
export function resistorBands(ohms) {
  const v = Number(ohms);
  if (!(v > 0)) return [0, 0, 0];
  const exponent = Math.max(-2, Math.min(9, Math.floor(Math.log10(v) + 1e-9) - 1));
  const base = Math.round(v / 10 ** exponent) % 100;
  return [Math.floor(base / 10), base % 10, exponent];
}

export const BAND_COLORS = {
  [-2]: 'Silver', [-1]: 'Gold', 0: 'Black', 1: 'Brown', 2: 'Red', 3: 'Orange', 4: 'Yellow', 5: 'Green', 6: 'Blue', 7: 'Violet', 8: 'Gray', 9: 'White',
};

export function defaultOptions(type) {
  const out = {};
  for (const o of PARTS[type].options ?? []) out[o.key] = o.default;
  return out;
}

// Translated display text; the English above is the fallback.
export const partLabel = (type) => tx(`part.${type}`, PARTS[type].label);
export const partHint = (type) => tx(`hint.${type}`, PARTS[type].hint ?? '');
export const optionLabel = (o) => tx(`option.${o.key}`, o.label);
export const commLabel = (comm) => tx(`comm.${comm}`, COMM[comm].label);
export const bandLabel = (digit) => tx(`band.${digit}`, BAND_COLORS[digit]);
