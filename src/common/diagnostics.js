// Turns arduino-cli / gcc / avrdude output into editor markers and
// beginner-friendly hints.

const GCC_LINE = /^(.*?\.(?:ino|cpp|c|h|hpp|S)):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*)$/;

// Returns [{ file, line, column, severity, message }].
// `file` is the base name, which is how sketch files are identified.
export function parseDiagnostics(output) {
  const out = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = GCC_LINE.exec(raw.trim());
    if (!m) continue;
    const [, file, line, col, kind, message] = m;
    if (kind === 'note') continue;
    out.push({
      file: file.split(/[\\/]/).pop(),
      path: file,
      line: Number(line),
      column: col ? Number(col) : 1,
      severity: kind === 'warning' ? 'warning' : 'error',
      message,
    });
  }
  return out;
}

const HINTS = [
  {
    re: /undefined reference to `(\w+)\(\)'/,
    hint: (m) => `The function ${m[1]}() is missing. If it is an interrupt handler from the Circuit tab, add "void ${m[1]}() { }" to your sketch.`,
  },
  {
    re: /'(\w+)' was not declared in this scope/,
    hint: (m) => `"${m[1]}" is not defined. Check the spelling (upper and lower case matter), or give a pin that name on the Circuit tab.`,
  },
  {
    re: /expected ';' before/,
    hint: () => 'A semicolon ; is probably missing at the end of the line before the error.',
  },
  {
    re: /expected '\}' at end of input/,
    hint: () => 'A closing brace } is missing. Every { needs a matching }.',
  },
  {
    re: /stfkart_pins\.h: No such file or directory/,
    hint: () => 'The pin file is missing. Open the Circuit tab and save the sketch to create it.',
  },
  {
    re: /Sketch too big|text section exceeds available space/,
    hint: () => 'The program is too big for the STFKart (32 KB). Remove unused libraries or long text strings.',
  },
  {
    re: /not enough memory|data section exceeds available space/,
    hint: () => 'The program uses too much RAM (2 KB). Use F("text") for Serial.print strings, and smaller arrays.',
  },
  {
    re: /(can't open device|could not open port|Permission denied).*(tty|COM)/is,
    hint: (m, platform) => (platform === 'linux'
      ? 'STFIDE is not allowed to use the serial port. Run "sudo usermod -aG dialout $USER", then log out and back in.'
      : 'The port is busy or not available. Close other programs that use the board (another serial monitor or IDE) and try again.'),
  },
  {
    re: /not in sync|programmer is not responding|unable to open port/i,
    hint: () => 'The board did not answer. Check that the right port is selected, unplug anything on D0/D1, and try again.',
  },
];

// Returns a list of unique hint strings for the whole output.
export function friendlyHints(output, platform) {
  const hints = new Set();
  for (const { re, hint } of HINTS) {
    const m = re.exec(output);
    if (m) hints.add(hint(m, platform));
  }
  return [...hints];
}

const SIZE_RE = /Sketch uses (\d+) bytes \((\d+)%\).*?Global variables use (\d+) bytes \((\d+)%\)/s;

export function parseSize(output) {
  const m = SIZE_RE.exec(output);
  if (!m) return null;
  return { flash: Number(m[1]), flashPct: Number(m[2]), ram: Number(m[3]), ramPct: Number(m[4]) };
}
