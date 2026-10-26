# STFIDE

An Arduino-style desktop IDE for the **STFKart** board, for Windows and Linux.

STFKart is electrically an Arduino Uno (ATmega328P, 16 MHz), so STFIDE builds
and uploads with the official Arduino toolchain. What it adds is a
**Circuit tab**, like Wokwi's circuit editor without the simulator: drop
parts (LED, button, servo, sensors, LCD…) next to the board, wire them to its
pins, give them names, and STFIDE writes the setup code for you. Your sketch
stays plain Arduino code.

```cpp
void setup() {
  stfkartBegin();            // pinMode, Serial.begin, servo.attach… from the Circuit tab
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
- **Circuit tab**: a canvas with the STFKart and parts drawn with
  [@wokwi/elements](https://github.com/wokwi/wokwi-elements). Click a pin to
  start a wire, click another to finish; resistors pass the signal through, so
  an LED wired via a resistor still counts. Delete, rotate (R), undo
  (Ctrl+Z), pan and zoom. Pins with no part can still be set up by hand.
- Plain-language warnings: pins used by USB/Serial, I2C or SPI, timer clashes
  between Servo/tone() and analogWrite(), parts not wired yet, two parts on
  one pin, invalid or duplicate names.
- Verify and Upload, with errors marked in the editor, click-to-jump, and
  beginner hints for common mistakes (missing `;`, misspelled names, missing
  interrupt functions, serial port permissions on Linux).
- Ready-made parts: ultrasonic distance sensor, DHT11/DHT22, DS18B20 probe,
  I2C LCD, NeoPixel ring, RGB LED and relay. Wiring one bundles its library
  and gives you a ready object such as `distance.readCm()`,
  `climate.readTemperature()` or `pump.on()`.
- **Settings** (gear button, or File › Settings…, Ctrl+,): language (English or
  Türkçe), editor font size, and the sketchbook folder where new sketches go.
- Port picker that recognises Uno-compatible USB chips, and a serial monitor
  that steps aside automatically while uploading.
- Examples: Blink, Button, Fade, AnalogRead, ServoKnob, InterruptCounter, Melody,
  WeatherStation, RainbowStrip.
- Works offline: arduino-cli, avr-gcc, avrdude and every library the Circuit tab
  uses are bundled in the installer.

## How the Circuit tab works

Each sketch folder holds:

| File | Who writes it |
| --- | --- |
| `MySketch.ino` (and any other tabs) | You |
| `stfkart.pins.json` | The Circuit tab (parts, wires and pin settings) |
| `stfkart_pins.h`, `stfkart_pins.cpp` | Generated from the JSON every time you save |

STFIDE adds `#include "stfkart_pins.h"` to the main sketch at build time (the
way the Arduino IDE adds `Arduino.h`), so sketches don't need that line. Extra
`.cpp`/`.h` tabs include it themselves; new tabs start with that line.

Generated files are always rewritten in full. They don't get editor tabs; you
can read them at the bottom of the Circuit tab. There are no "USER CODE" markers to keep intact, and regenerating can never break your
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
src/renderer/    UI: toolbar, editor, Circuit tab, output, serial monitor
src/common/      Shared by both: board definition, pin model + codegen, components, i18n, diagnostics
resources/hardware/stfkart/   arduino-cli platform for STFKart (FQBN stfkart:avr:stfkart)
examples/        Example sketches with their pin setups
scripts/         fetch-toolchain.js
```

### When the STFKart hardware is final

- `resources/hardware/stfkart/avr/boards.txt`: board settings, plus the USB
  vid/pid so the board is detected by name.
- `src/common/board.js`: pin capabilities and header layout for the Circuit tab.
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

### Adding a component

Add an entry to `COMPONENTS` in `src/common/components.js`: its pins, options,
library (`"Name@version"` from the Arduino library index), and the code it
generates. `npm run fetch-toolchain` bundles the library, and the tests compile
every component automatically.
