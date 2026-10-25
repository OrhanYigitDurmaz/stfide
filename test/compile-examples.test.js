// Compiles every example with the real toolchain, the same way the app does.
// Skipped when arduino-cli or the AVR core is not available, so `npm test`
// still works in a fresh checkout. Run `npm run fetch-toolchain` first to
// enable it.
//
// For development without the bundled AVR core, STFIDE_TEST_AVR_CORE can
// point at a checkout of github.com/arduino/ArduinoCore-avr and
// STFIDE_TEST_LIBRARIES at library checkouts (Servo), combined with
// STFIDE_BUILD_PROPERTIES for a system compiler and ctags.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Toolchain } from '../src/main/toolchain.js';
import { listExamples, loadSketch, saveSketch, copySketch } from '../src/main/sketch.js';
import { parseDiagnostics } from '../src/common/diagnostics.js';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stfide-test-'));
const toolchain = new Toolchain({ resourcesDir: path.join(root, 'resources'), userDataDir: tmp });
toolchain.installBoardPlatform();
if (process.env.STFIDE_TEST_AVR_CORE) {
  fs.cpSync(process.env.STFIDE_TEST_AVR_CORE, path.join(toolchain.userDir, 'hardware', 'arduino', 'avr'), { recursive: true });
}
for (const lib of (process.env.STFIDE_TEST_LIBRARIES || '').split(path.delimiter).filter(Boolean)) {
  fs.cpSync(lib, path.join(toolchain.userDir, 'libraries', path.basename(lib)), { recursive: true });
}
const status = await toolchain.status();
const skip = !status.cli || !status.core ? 'arduino-cli with the AVR core is not available' : false;

for (const ex of listExamples(path.join(root, 'examples'))) {
  test(`example ${ex.name} compiles for STFKart`, { skip }, async () => {
    const sketch = copySketch(path.join(root, 'examples', ex.name), path.join(tmp, 'sketches', ex.name));
    saveSketch(sketch.dir, sketch);
    const r = await toolchain.compile(sketch.dir, {});
    const errors = parseDiagnostics(r.stdout + r.stderr).filter((d) => d.severity === 'error');
    assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
    assert.deepEqual(errors, []);
    assert.match(r.stdout, /Sketch uses \d+ bytes/);
  });
}

test('pin names work without including stfkart_pins.h', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const sketch = createSketch(path.join(tmp, 'noinclude'));
  const main = path.join(sketch.dir, sketch.main);
  assert.doesNotMatch(fs.readFileSync(main, 'utf8'), /#include/);
  fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace('void loop() {', 'void loop() {\n  digitalWrite(led, HIGH);'));
  saveSketch(sketch.dir, { files: [], config: { pins: { D13: { role: 'led', name: 'led' } } } });
  const r = await toolchain.compile(sketch.dir, {});
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /staged/);
});

test('a new sketch with no pins compiles', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const sketch = createSketch(path.join(tmp, 'book'));
  const r = await toolchain.compile(sketch.dir, {});
  assert.equal(r.code, 0, r.stderr);
});

test('a compile error is reported against the sketch file', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const sketch = createSketch(path.join(tmp, 'broken'));
  const main = path.join(sketch.dir, sketch.main);
  fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace('void loop() {', 'void loop() {\n  digitalWrit(13, HIGH);'));
  const r = await toolchain.compile(loadSketch(sketch.dir).dir, {});
  assert.notEqual(r.code, 0);
  const d = parseDiagnostics(r.stdout + r.stderr).find((x) => x.severity === 'error');
  assert.equal(d.file, sketch.main);
  // The include STFIDE adds at build time must not shift line numbers.
  const lines = fs.readFileSync(main, 'utf8').split('\n');
  assert.equal(d.line, lines.findIndex((l) => l.includes('digitalWrit(')) + 1);
});
