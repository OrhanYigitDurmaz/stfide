// Downloads arduino-cli and installs the AVR core and bundled libraries into
// resources/toolchain/, which electron-builder ships inside the app.
// The result works offline: users never need to download a compiler.
//
//   node scripts/fetch-toolchain.js [--platform linux|win32] [--force]
//
// arduino-cli installs compiler binaries for the machine it runs on, so the
// target platform must match the build machine. Build the Windows installer
// on Windows and the Linux packages on Linux (CI does both).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allComponentLibraries } from '../src/common/components.js';

const ARDUINO_CLI_VERSION = '1.3.1';
const AVR_CORE = 'arduino:avr@1.8.6';
// Servo for the servo pin role, plus every library a Circuit tab component uses.
const LIBRARIES = ['Servo@1.2.2', ...allComponentLibraries()];

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'resources', 'toolchain');
const args = process.argv.slice(2);
const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : process.platform;
const force = args.includes('--force');

const ASSETS = {
  linux: { file: `arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz`, exe: 'arduino-cli' },
  win32: { file: `arduino-cli_${ARDUINO_CLI_VERSION}_Windows_64bit.zip`, exe: 'arduino-cli.exe' },
};

function fail(msg) {
  console.error(`fetch-toolchain: ${msg}`);
  process.exit(1);
}

function run(cmd, cmdArgs, env = {}) {
  console.log(`> ${path.basename(cmd)} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`${path.basename(cmd)} ${cmdArgs[0]} failed (exit ${r.status ?? r.error}).`);
}

if (!ASSETS[platform]) fail(`unsupported platform "${platform}". Use linux or win32.`);
if (platform !== process.platform) {
  fail(`can't prepare a ${platform} toolchain on ${process.platform}: arduino-cli installs compilers for the current OS. Run this on ${platform}.`);
}
if (process.arch !== 'x64') fail(`only x64 builds are set up (this machine is ${process.arch}).`);

const asset = ASSETS[platform];
const cli = path.join(out, asset.exe);
const stamp = path.join(out, 'VERSION');
const wanted = `${platform} cli=${ARDUINO_CLI_VERSION} core=${AVR_CORE} libs=${LIBRARIES.join(',')}`;
if (!force && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === wanted) {
  console.log(`Toolchain already prepared (${wanted}).`);
  process.exit(0);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stfide-toolchain-'));

// 1. arduino-cli itself, from the official GitHub release.
const url = `https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/${asset.file}`;
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) fail(`download failed: HTTP ${res.status}`);
const archive = path.join(tmp, asset.file);
fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
if (platform === 'win32') {
  const unzipDir = path.join(tmp, 'cli');
  run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${unzipDir}'`]);
  fs.copyFileSync(path.join(unzipDir, asset.exe), cli);
} else {
  run('tar', ['-xzf', archive, '-C', out, asset.exe]);
  fs.chmodSync(cli, 0o755);
}

// 2. The AVR core (avr-gcc, avrdude, ctags) into the bundled data dir.
const env = {
  ARDUINO_DIRECTORIES_DATA: path.join(out, 'data'),
  ARDUINO_DIRECTORIES_USER: path.join(tmp, 'user'),
  ARDUINO_DIRECTORIES_DOWNLOADS: path.join(tmp, 'downloads'),
  ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
};
run(cli, ['core', 'update-index'], env);
run(cli, ['core', 'install', AVR_CORE], env);

// 3. Libraries every sketch can use, kept as "built-in" libraries.
run(cli, ['lib', 'update-index'], env);
for (const lib of LIBRARIES) run(cli, ['lib', 'install', lib], env);
fs.cpSync(path.join(tmp, 'user', 'libraries'), path.join(out, 'libraries'), { recursive: true });

fs.writeFileSync(stamp, `${wanted}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Toolchain ready in ${path.relative(root, out)}`);
