// Runs arduino-cli for compiling and uploading.
//
// Layout (inside the installed app's resources folder, or ./resources when
// running from a checkout):
//   toolchain/arduino-cli[.exe]   bundled CLI, fetched by scripts/fetch-toolchain.js
//   toolchain/data/               bundled arduino:avr core + avr-gcc + avrdude
//   toolchain/libraries/          bundled libraries (Servo)
//   hardware/stfkart/avr/         the STFKart platform (boards.txt)
//
// The STFKart platform is copied into a writable "user" directory under the
// app's userData folder, where arduino-cli looks for third-party hardware.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BOARD } from '../common/board.js';
import { HEADER_FILE } from '../common/pins.js';

const EXE = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';

export class Toolchain {
  constructor({ resourcesDir, userDataDir }) {
    this.resourcesDir = resourcesDir;
    this.userDataDir = userDataDir;
    this.current = null;

    const bundledCli = path.join(resourcesDir, 'toolchain', EXE);
    const bundledData = path.join(resourcesDir, 'toolchain', 'data');
    // Libraries every sketch can use without installing them (Servo, ...).
    this.builtinLibrariesDir = path.join(resourcesDir, 'toolchain', 'libraries');
    this.cli = process.env.STFIDE_ARDUINO_CLI || (fs.existsSync(bundledCli) ? bundledCli : findOnPath(EXE));
    this.dataDir = fs.existsSync(bundledData) ? bundledData : path.join(userDataDir, 'arduino-data');
    this.userDir = path.join(userDataDir, 'arduino-user');
    this.downloadsDir = path.join(userDataDir, 'arduino-downloads');
    this.buildRoot = path.join(userDataDir, 'build');
    // Extra --build-property values, separated by ";". Only meant for
    // development, e.g. to use a system avr-gcc.
    this.extraProps = (process.env.STFIDE_BUILD_PROPERTIES || '').split(';').map((s) => s.trim()).filter(Boolean);
  }

  installBoardPlatform() {
    const src = path.join(this.resourcesDir, 'hardware', 'stfkart');
    const dest = path.join(this.userDir, 'hardware', 'stfkart');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
  }

  env() {
    return {
      ...process.env,
      ARDUINO_DIRECTORIES_DATA: this.dataDir,
      ARDUINO_DIRECTORIES_USER: this.userDir,
      ARDUINO_DIRECTORIES_DOWNLOADS: this.downloadsDir,
      ...(fs.existsSync(this.builtinLibrariesDir) ? { ARDUINO_DIRECTORIES_BUILTIN_LIBRARIES: this.builtinLibrariesDir } : {}),
      ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
      ARDUINO_METRICS_ENABLED: 'false',
    };
  }

  // Returns { cli: bool, core: bool } so the UI can explain what is missing.
  async status() {
    if (!this.cli) return { cli: false, core: false };
    const r = await this.run(['core', 'list', '--json'], {});
    if (r.code !== 0) return { cli: true, core: false };
    try {
      const list = JSON.parse(r.stdout);
      const platforms = list.platforms ?? list ?? [];
      return { cli: true, core: platforms.some((p) => p.id === 'arduino:avr') };
    } catch {
      return { cli: true, core: false };
    }
  }

  // Downloads arduino:avr when it was not bundled (development checkouts).
  installCore(onOutput) {
    return this.run(['core', 'install', 'arduino:avr'], { onOutput, track: true });
  }

  // Builds a staged copy of the sketch whose main .ino starts with
  // #include "stfkart_pins.h", so the user's code doesn't need that line
  // (like Arduino.h). Paths in the output are mapped back to the real sketch.
  compile(sketchDir, { port, upload, onOutput }) {
    const hash = crypto.createHash('sha1').update(sketchDir).digest('hex').slice(0, 12);
    const staged = stageSketch(sketchDir, path.join(this.buildRoot, hash, 'staged'));
    const args = [
      'compile',
      '--fqbn', BOARD.fqbn,
      '--build-path', path.join(this.buildRoot, hash, 'build'),
      '--warnings', 'default',
    ];
    for (const p of this.extraProps) args.push('--build-property', p);
    if (upload) args.push('--upload', '--port', port);
    args.push(staged);
    const mapText = (text) => text.split(staged).join(sketchDir);
    return this.run(args, { onOutput, track: true, mapText });
  }

  cancel() {
    if (this.current) this.current.kill();
  }

  run(args, { onOutput, track, mapText = (t) => t }) {
    return new Promise((resolve) => {
      if (!this.cli) {
        resolve({ code: -1, stdout: '', stderr: 'arduino-cli not found' });
        return;
      }
      const child = spawn(this.cli, ['--no-color', ...args], { env: this.env(), windowsHide: true });
      if (track) this.current = child;
      let stdout = '';
      let stderr = '';
      // Both streams in arrival order, as the user saw them.
      const chunks = [];
      const collect = (stream) => (d) => {
        const text = mapText(String(d));
        if (stream === 'stdout') stdout += text;
        else stderr += text;
        chunks.push({ text, stream });
        onOutput?.(text, stream);
      };
      child.stdout.on('data', collect('stdout'));
      child.stderr.on('data', collect('stderr'));
      child.on('error', (err) => {
        if (track) this.current = null;
        resolve({ code: -1, stdout, stderr: stderr + String(err), chunks });
      });
      child.on('close', (code) => {
        if (track) this.current = null;
        resolve({ code: code ?? -1, stdout, stderr, chunks });
      });
    });
  }
}

export const AUTO_INCLUDE = `#include "${HEADER_FILE}"`;

// Mirrors the sketch folder into `dest`, writing only files that changed so
// arduino-cli's incremental build keeps working, and prepends the pin header
// include to the main .ino. `#line 1` keeps compiler line numbers matching
// the user's file.
export function stageSketch(sketchDir, stagingRoot) {
  const name = path.basename(sketchDir);
  const dest = path.join(stagingRoot, name);
  const wanted = new Set();
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(sketchDir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(r);
      else if (entry.isFile()) {
        wanted.add(r);
        let content = fs.readFileSync(path.join(sketchDir, r));
        if (r === `${name}.ino`) content = Buffer.from(`${AUTO_INCLUDE}\n#line 1\n${content}`);
        const out = path.join(dest, r);
        if (fs.existsSync(out) && fs.readFileSync(out).equals(content)) continue;
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, content);
      }
    }
  };
  walk('');
  // Drop files the user deleted from the sketch.
  const prune = (rel) => {
    const dir = path.join(dest, rel);
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) prune(r);
      else if (!wanted.has(r)) fs.rmSync(path.join(dest, r));
    }
  };
  prune('');
  return dest;
}

function findOnPath(exe) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    if (dir && fs.existsSync(p)) return p;
  }
  return null;
}
