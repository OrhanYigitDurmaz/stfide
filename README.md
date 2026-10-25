# STFIDE

An Arduino-style desktop IDE for the **STFKart** board, for Windows and Linux.

STFKart is electrically an Arduino Uno (ATmega328P, 16 MHz), so STFIDE builds
and uploads with the official Arduino toolchain. What it adds is a
**Pins tab**: click a pin on a drawing of the board, say what it is (LED,
button, servo, potentiometer…), give it a name, and STFIDE writes the setup
code for you. Your sketch stays plain Arduino code.

```cpp
#include "stfkart_pins.h"

void setup() {
  stfkartBegin();            // pinMode, Serial.begin, servo.attach… from the Pins tab
}

void loop() {
  if (startButtonPressed()) {
    digitalWrite(redLed, HIGH);
  }
}
```

## Features

- Code editor (Monaco, the editor from VS Code) with Arduino autocomplete that
  knows your pin names, hover help, and multi-file sketches.
- **Pins tab** with plain-language warnings: pins used by USB/Serial, I2C or
  SPI, timer clashes between Servo/tone() and analogWrite(), invalid or
  duplicate names.
- Verify and Upload, with errors marked in the editor, click-to-jump, and
  beginner hints for common mistakes (missing `;`, misspelled names, missing
  interrupt functions, serial port permissions on Linux).
- Port picker that recognises Uno-compatible USB chips, and a serial monitor
  that steps aside automatically while uploading.
- Examples: Blink, Button, Fade, AnalogRead, ServoKnob, InterruptCounter, Melody.
- Works offline: arduino-cli, avr-gcc, avrdude and the Servo library are
  bundled in the installer.

## How the Pins tab works

Each sketch folder holds:

| File | Who writes it |
| --- | --- |
| `MySketch.ino` (and any other tabs) | You |
| `stfkart.pins.json` | The Pins tab |
| `stfkart_pins.h`, `stfkart_pins.cpp` | Generated from the JSON every time you save |

Generated files are always rewritten in full. They don't get editor tabs; you
can read them at the bottom of the Pins tab. There are no "USER CODE" markers to keep intact, and regenerating can never break your
code.

## Development

Requires Node.js 22.

```sh
npm ci
npm run fetch-toolchain   # downloads arduino-cli + the AVR core into resources/toolchain
npm start
npm test                  # unit tests; also compiles every example once the toolchain is present
```

Build installers (each on its own OS, because arduino-cli installs compilers
for the machine it runs on):

```sh
npm run dist:linux        # dist/*.AppImage and dist/*.deb
npm run dist:win          # dist/*.exe (NSIS installer)
```

CI (`.github/workflows/build.yml`) does both and uploads the installers as
build artifacts.

### Layout

```
src/main/        Electron main process: window, menus, arduino-cli, serial ports
src/renderer/    UI: toolbar, editor, Pins tab, output, serial monitor
src/common/      Shared by both: board definition, pin model + codegen, i18n, diagnostics
resources/hardware/stfkart/   arduino-cli platform for STFKart (FQBN stfkart:avr:stfkart)
examples/        Example sketches with their pin setups
scripts/         fetch-toolchain.js
```

### When the STFKart hardware is final

- `resources/hardware/stfkart/avr/boards.txt`: board settings, plus the USB
  vid/pid so the board is detected by name.
- `src/common/board.js`: pin capabilities and header layout for the Pins tab.
- `src/main/serial.js`: USB vendor ids shown as "STFKart" in the port picker.

### Linux serial permissions

Uploading needs access to `/dev/ttyACM*` / `/dev/ttyUSB*`. On most
distributions:

```sh
sudo usermod -aG dialout $USER   # then log out and back in
```

### Translations

UI strings live in `src/common/i18n.js`. Add a language by filling in a new
dictionary (a `tr` one is already stubbed) and setting `"language"` in the
app's `settings.json`.
