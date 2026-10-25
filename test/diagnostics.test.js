import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyHints, parseDiagnostics, parseSize } from '../src/common/diagnostics.js';

test('parses gcc errors with sketch file names', () => {
  const out = [
    '/home/u/STFKart/Blink/Blink.ino: In function \'void loop()\':',
    '/home/u/STFKart/Blink/Blink.ino:9:3: error: \'digitalWrit\' was not declared in this scope',
    'C:\\Users\\u\\STFKart\\Blink\\helpers.h:3:10: warning: unused variable \'x\'',
    '/home/u/STFKart/Blink/Blink.ino:9:3: note: suggested alternative: \'digitalWrite\'',
  ].join('\n');
  const d = parseDiagnostics(out);
  assert.equal(d.length, 2);
  assert.deepEqual(
    { file: d[0].file, line: d[0].line, column: d[0].column, severity: d[0].severity },
    { file: 'Blink.ino', line: 9, column: 3, severity: 'error' },
  );
  assert.equal(d[1].file, 'helpers.h');
  assert.equal(d[1].severity, 'warning');
});

test('gives beginner hints', () => {
  const hints = friendlyHints("x.ino:3:1: error: 'ledd' was not declared in this scope\nundefined reference to `onBump()'", 'linux');
  assert.equal(hints.length, 2);
  assert.match(hints[0], /onBump/);
  assert.match(friendlyHints("avrdude: ser_open(): can't open device \"/dev/ttyACM0\": Permission denied", 'linux')[0], /dialout/);
});

test('reads the size summary', () => {
  const s = parseSize('Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.\nGlobal variables use 9 bytes (0%) of dynamic memory');
  assert.deepEqual(s, { flash: 924, flashPct: 2, ram: 9, ramPct: 0 });
});
