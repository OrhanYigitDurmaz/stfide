// Sketch folders on disk. A sketch is a folder whose main file has the same
// name as the folder (Blink/Blink.ino), like in the Arduino IDE.

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE, emptyConfig, generate, normalizeConfig } from '../common/pins.js';

const SOURCE_EXT = new Set(['.ino', '.cpp', '.c', '.h', '.hpp']);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const NEW_SKETCH = `void setup() {
  stfkartBegin();  // sets up the pins from the Circuit tab

}

void loop() {

}
`;

const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

export function isValidSketchName(name) {
  return VALID_NAME.test(name);
}

// Accepts a sketch folder or any file inside it.
export function resolveSketchDir(p) {
  const st = fs.statSync(p);
  return st.isDirectory() ? p : path.dirname(p);
}

export function loadSketch(dir) {
  const name = path.basename(dir);
  const main = `${name}.ino`;
  if (!fs.existsSync(path.join(dir, main))) {
    throw new Error(`"${dir}" is not a sketch: ${main} is missing.`);
  }
  const files = fs.readdirSync(dir)
    .filter((f) => SOURCE_EXT.has(path.extname(f).toLowerCase()) && fs.statSync(path.join(dir, f)).isFile())
    .sort((a, b) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b)))
    .map((f) => ({ name: f, content: fs.readFileSync(path.join(dir, f), 'utf8') }));
  let config = emptyConfig();
  const cfgPath = path.join(dir, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    config = normalizeConfig(JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
  }
  return { dir, name, main, files, config };
}

// Writes the given source files plus the pin config and generated code.
export function saveSketch(dir, { files, config }) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    if (path.basename(f.name) !== f.name) throw new Error(`Bad file name: ${f.name}`);
    writeIfChanged(path.join(dir, f.name), f.content);
  }
  writeIfChanged(path.join(dir, CONFIG_FILE), `${JSON.stringify(normalizeConfig(config), null, 2)}\n`);
  for (const [name, content] of Object.entries(generate(normalizeConfig(config)))) {
    writeIfChanged(path.join(dir, name), content);
  }
}

// Skipping unchanged files keeps arduino-cli's build cache warm.
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

export function uniqueSketchDir(parent, base) {
  let candidate = path.join(parent, base);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(parent, `${base}_${i}`);
  return candidate;
}

export function createSketch(sketchbook, date = new Date()) {
  const base = `sketch_${MONTHS[date.getMonth()]}${date.getDate()}`;
  let dir = path.join(sketchbook, `${base}a`);
  for (let c = 98; fs.existsSync(dir) && c <= 122; c++) dir = path.join(sketchbook, base + String.fromCharCode(c));
  if (fs.existsSync(dir)) dir = uniqueSketchDir(sketchbook, base);
  const name = path.basename(dir);
  saveSketch(dir, { files: [{ name: `${name}.ino`, content: NEW_SKETCH }], config: emptyConfig() });
  return loadSketch(dir);
}

// Copies a sketch to a new folder, renaming the main .ino to match.
export function copySketch(fromDir, toDir, { files, config } = {}) {
  if (fs.existsSync(toDir)) throw new Error(`"${toDir}" already exists.`);
  const fromMain = `${path.basename(fromDir)}.ino`;
  const toMain = `${path.basename(toDir)}.ino`;
  fs.mkdirSync(toDir, { recursive: true });
  for (const f of fs.readdirSync(fromDir)) {
    const src = path.join(fromDir, f);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(toDir, f === fromMain ? toMain : f));
  }
  if (files) {
    saveSketch(toDir, {
      files: files.map((f) => ({ ...f, name: f.name === fromMain ? toMain : f.name })),
      config,
    });
  }
  return loadSketch(toDir);
}

export function listExamples(examplesDir) {
  if (!fs.existsSync(examplesDir)) return [];
  return fs.readdirSync(examplesDir)
    .filter((d) => fs.existsSync(path.join(examplesDir, d, `${d}.ino`)))
    .map((d) => {
      const ino = fs.readFileSync(path.join(examplesDir, d, `${d}.ino`), 'utf8');
      const m = /^\/\/\s*(.+)$/m.exec(ino);
      return { name: d, description: m ? m[1] : '' };
    });
}
