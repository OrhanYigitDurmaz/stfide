import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRole, emptyConfig, generate, hasErrors, missingHandlers, normalizeConfig, rolesForPin, validate,
} from '../src/common/pins.js';

const withPins = (pins, extra = {}) => normalizeConfig({ ...emptyConfig(), ...extra, pins });
const messages = (cfg) => validate(cfg).map((i) => `${i.level}: ${i.message}`);

test('roles offered per pin follow the hardware', () => {
  assert.ok(rolesForPin('D9').includes('pwm'));
  assert.ok(!rolesForPin('D8').includes('pwm'));
  assert.ok(rolesForPin('D2').includes('interrupt'));
  assert.ok(!rolesForPin('D4').includes('interrupt'));
  assert.ok(rolesForPin('A0').includes('analog'));
  assert.ok(!rolesForPin('D7').includes('analog'));
});

test('assignRole suggests unique names and keeps custom ones', () => {
  let cfg = emptyConfig();
  cfg = assignRole(cfg, 'D3', 'led');
  cfg = assignRole(cfg, 'D4', 'led');
  assert.equal(cfg.pins.D3.name, 'led1');
  assert.equal(cfg.pins.D4.name, 'led2');
  cfg.pins.D3.name = 'redLed';
  cfg = assignRole(cfg, 'D3', 'output');
  assert.equal(cfg.pins.D3.name, 'redLed');
  cfg = assignRole(cfg, 'D3', 'unused');
  assert.equal(cfg.pins.D3, undefined);
});

test('interrupt pins get a handler name', () => {
  const cfg = assignRole(emptyConfig(), 'D2', 'interrupt');
  assert.equal(cfg.pins.D2.handler, 'onTrigger1');
});

test('a clean config has no problems', () => {
  const cfg = withPins({ D13: { role: 'led', name: 'led' }, D2: { role: 'button', name: 'go' } });
  assert.deepEqual(validate(cfg), []);
});

test('bad and duplicate names are errors', () => {
  const cfg = withPins({
    D3: { role: 'led', name: '2fast' },
    D4: { role: 'led', name: 'delay' },
    D5: { role: 'output', name: 'motor' },
    D6: { role: 'output', name: 'motor' },
    D7: { role: 'button', name: 'go' },
    D8: { role: 'output', name: 'goPressed' },
  });
  const m = messages(cfg).join('\n');
  assert.match(m, /"2fast" is not a valid name/);
  assert.match(m, /"delay" is already used by Arduino/);
  assert.match(m, /"motor" is used for more than one pin/);
  assert.match(m, /"goPressed" is used for more than one pin/);
});

test('roles on unsupported pins are errors', () => {
  const cfg = withPins({ D8: { role: 'pwm', name: 'x' }, D4: { role: 'interrupt', name: 'y', handler: 'onY' } });
  assert.equal(validate(cfg).filter((i) => i.level === 'error').length, 2);
});

test('serial pins conflict only while Serial is on', () => {
  const on = withPins({ D0: { role: 'led', name: 'a' } }, { serial: { enabled: true } });
  assert.ok(hasErrors(validate(on)));
  const off = withPins({ D0: { role: 'led', name: 'a' } }, { serial: { enabled: false } });
  assert.ok(!hasErrors(validate(off)));
  assert.match(messages(off)[0], /warning: .*USB chip/);
});

test('I2C and SPI claim their pins', () => {
  const cfg = withPins(
    { A4: { role: 'analog', name: 'a' }, D12: { role: 'input', name: 'b' }, D10: { role: 'button', name: 'c' } },
    { i2c: { enabled: true }, spi: { enabled: true } },
  );
  const m = messages(cfg).join('\n');
  assert.match(m, /A4 is used by I2C \(SDA\)/);
  assert.match(m, /D12 is used by SPI \(MISO\)/);
  assert.match(m, /D10 must stay an output/);
  const ok = withPins({ D10: { role: 'output', name: 'cs' } }, { spi: { enabled: true } });
  assert.ok(!hasErrors(validate(ok)));
});

test('servo and tone timer conflicts are warnings', () => {
  const cfg = withPins({
    D7: { role: 'servo', name: 'arm' },
    D9: { role: 'pwm', name: 'fan' },
    D8: { role: 'buzzer', name: 'beep' },
    D3: { role: 'pwm', name: 'glow' },
  });
  const m = messages(cfg).join('\n');
  assert.match(m, /warning: Servos use Timer1, so analogWrite\(\) on D9/);
  assert.match(m, /warning: tone\(\) uses Timer2, so analogWrite\(\) on D3/);
  assert.ok(!hasErrors(validate(cfg)));
});

test('generated code sets up every role', () => {
  const cfg = withPins({
    D13: { role: 'led', name: 'led', initial: 'HIGH' },
    D2: { role: 'interrupt', name: 'bump', handler: 'onBump', mode: 'RISING', pullup: false },
    D4: { role: 'button', name: 'go' },
    D5: { role: 'pwm', name: 'glow', value: 300 },
    D7: { role: 'servo', name: 'arm', angle: 45 },
    D8: { role: 'input', name: 'sw', pullup: true },
    A0: { role: 'analog', name: 'knob' },
  }, { serial: { enabled: true, baud: 115200 }, i2c: { enabled: true, clock: 400000 } });
  const { 'stfkart_pins.h': hdr, 'stfkart_pins.cpp': src } = generate(cfg);
  assert.match(hdr, /#include <Servo.h>/);
  assert.match(hdr, /#include <Wire.h>/);
  assert.doesNotMatch(hdr, /#include <SPI.h>/);
  assert.match(hdr, /const uint8_t led = 13;/);
  assert.match(hdr, /const uint8_t knob = A0;/);
  assert.match(hdr, /const uint8_t armPin = 7;/);
  assert.match(hdr, /extern Servo arm;/);
  assert.match(hdr, /inline bool goPressed\(\) \{ return digitalRead\(go\) == LOW; \}/);
  assert.match(hdr, /void onBump\(\);/);
  assert.match(src, /Servo arm;/);
  assert.match(src, /Serial.begin\(115200\);/);
  assert.match(src, /Wire.setClock\(400000\);/);
  assert.match(src, /digitalWrite\(led, HIGH\);/);
  assert.match(src, /analogWrite\(glow, 255\);/);
  assert.match(src, /arm.attach\(armPin\);\n {2}arm.write\(45\);/);
  assert.match(src, /pinMode\(sw, INPUT_PULLUP\);/);
  assert.match(src, /attachInterrupt\(digitalPinToInterrupt\(bump\), onBump, RISING\);/);
});

test('missingHandlers finds handlers not yet written', () => {
  const cfg = withPins({ D2: { role: 'interrupt', name: 'bump', handler: 'onBump', mode: 'FALLING' } });
  assert.deepEqual(missingHandlers(cfg, ['void loop() {}']), ['onBump']);
  assert.deepEqual(missingHandlers(cfg, ['void onBump() {\n}']), []);
});

test('normalizeConfig drops unknown pins and roles', () => {
  const cfg = normalizeConfig({ pins: { D99: { role: 'led', name: 'x' }, D3: { role: 'laser', name: 'y' }, D4: { role: 'led', name: 'z' } } });
  assert.deepEqual(Object.keys(cfg.pins), ['D4']);
  assert.equal(cfg.pins.D4.initial, 'LOW');
});
