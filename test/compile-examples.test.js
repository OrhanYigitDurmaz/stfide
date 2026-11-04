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

test('every component compiles with its library', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const { COMPONENTS } = await import('../src/common/components.js');
  const { addComponent, codeSymbols, emptyConfig } = await import('../src/common/pins.js');
  let config = emptyConfig();
  for (const type of Object.keys(COMPONENTS)) config = addComponent(config, type);
  const sketch = createSketch(path.join(tmp, 'components'));
  const calls = codeSymbols(config).flatMap((s) => s.usage).map((u) => `  {\n${u}\n  }`).join('\n');
  const main = path.join(sketch.dir, sketch.main);
  fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace('void loop() {', `void loop() {\n${calls}`));
  saveSketch(sketch.dir, { files: [], config });
  const r = await toolchain.compile(sketch.dir, {});
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
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

test('STF sketch: translation and C++ errors point at the .stf line', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const sketch = createSketch(path.join(tmp, 'stf'), new Date(), { stf: true });
  assert.equal(sketch.main, `${sketch.name}.stf`);
  const main = path.join(sketch.dir, sketch.main);

  // Unknown name: caught by the C++ compiler, mapped back with #line.
  fs.writeFileSync(main, 'kur\nson\n\ndöngü\n    bekle(10)\n    yak(olmayanPin)\nson\n');
  let r = await toolchain.compile(sketch.dir, {});
  assert.notEqual(r.code, 0);
  let d = parseDiagnostics(r.stdout + r.stderr).find((x) => x.severity === 'error');
  assert.equal(d.file, sketch.main);
  assert.equal(d.line, 6);

  // Syntax error: caught by the STF translator before arduino-cli runs.
  fs.writeFileSync(main, 'döngü\n    eğer 1 = 1 ise\n    son\nson\n');
  r = await toolchain.compile(sketch.dir, {});
  assert.notEqual(r.code, 0);
  d = parseDiagnostics(r.stderr).find((x) => x.severity === 'error');
  assert.equal(d.file, sketch.main);
  assert.equal(d.line, 2);
  assert.match(d.message, /==/);
});

test('STF: every Turkish library method name compiles', { skip }, async () => {
  const { createSketch } = await import('../src/main/sketch.js');
  const sketch = createSketch(path.join(tmp, 'stflib'), new Date(), { stf: true });
  fs.writeFileSync(path.join(sketch.dir, sketch.main), `
nesne Servo kol
nesne LcdEkran ekran(0x27, 16, 2)
nesne DhtSensor hava(2, DHT11)
nesne NeoPiksel serit(8, 6, NEO_GRB + NEO_KHZ800)
nesne YazilimSeri seri2(10, 11)
nesne TekTel tel(4)
nesne SicaklikSensorleri prob(tel)
kur
    kol.bağla(9)
    kol.açı(90)
    kol.mikrosaniye(1500)
    sayı a = kol.açı_oku()
    mantık b = kol.bağlı_mı()
    kol.ayır()
    ekran.başlat()
    ekran.ışık_aç()
    ekran.ışık_kapat()
    ekran.temizle()
    ekran.başa_dön()
    ekran.imleç(0, 1)
    ekran.yaz("x")
    ekran.göster()
    ekran.gizle()
    ekran.imleci_göster()
    ekran.imleci_gizle()
    ekran.yanıp_sön()
    ekran.yanıp_sönme()
    ekran.sola_kaydır()
    ekran.sağa_kaydır()
    hava.başlat()
    ondalık s = hava.sıcaklık_oku() + hava.nem_oku()
    serit.başlat()
    serit.parlaklık(40)
    serit.piksel(0, serit.renk(1, 2, 3))
    serit.piksel(1, serit.renk_tonu(1000))
    serit.doldur(serit.renk(0, 0, 0))
    sayı n = serit.piksel_sayısı()
    serit.temizle()
    serit.göster()
    seri2.başlat(9600)
    seri2.dinle()
    seri2.yaz("a")
    seri2.satır_yaz(1)
    seri2.gönder(65)
    eğer seri2.hazır() > 0 ise
        sayı c = seri2.oku() + seri2.sayı_oku()
        ondalık d = seri2.ondalık_oku()
    son
    seri2.bekle_gönder()
    tel.sıfırla()
    tel.atla()
    tel.gönder(0x44)
    sayı e = tel.oku()
    prob.başlat()
    prob.ölç()
    ondalık f = prob.sıcaklık_oku(0) + prob.sensör_sayısı()
    Serial.başlat(9600)
    Serial.satır_yaz("ok")
    Wire.başlat()
    Wire.hız(100000)
    Wire.iletim_başlat(8)
    Wire.gönder(1)
    Wire.iletim_bitir()
    Wire.iste(8, 1)
    eğer Wire.hazır() > 0 ise
        sayı g = Wire.oku()
    son
    EEPROM.yaz(0, 1)
    EEPROM.kaydet(1, 2)
    sayı h = EEPROM.oku(0) + EEPROM.uzunluk()
    SPI.başlat()
    sayı k = SPI.aktar(0)
    SPI.bitir()
son
`);
  const r = await toolchain.compile(sketch.dir, {});
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
});
