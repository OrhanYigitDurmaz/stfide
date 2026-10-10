# stfide-gen

Board configuration code generator for custom **RP2040** and **ESP32-S3** cards.
Part of the [stfide](../README.md) IDE project.

One board file (`boards/*.board.json`) is the source of truth; `stfide-gen`
turns it into ready-to-compile initialization code for several target stacks.

## Usage

```bash
cd stfide-gen
npm install          # once
npm run build

node lib/cli.js targets                                  # list emitters
node lib/cli.js validate ../boards/oc1-rp2040.board.json # validate a board file
node lib/cli.js generate ../boards/oc1-rp2040.board.json --target pico --out ../generated
```

`generate` may be called with repeated `--target` flags (e.g. `--target arduino
--target pico`); files are written to `<out>/<target>/...`.

## Targets

| id        | Generates                                              | MCUs              |
|-----------|--------------------------------------------------------|-------------------|
| `arduino` | `board_config.h`, `board_init.cpp`, variant `pins_arduino.h`, blink example | RP2040, ESP32-S3 |
| `pico`    | `board_pins.h`, `board_init.h/.c`, blink example        | RP2040            |
| `espidf`  | `board_pins.h`, `board_init.h/.c`, blink example        | ESP32-S3          |

## Board file format

See `../boards/oc1-rp2040.board.json` and `../boards/oc1-esp32s3.board.json`.
Schema version is `1`:

- `name` / `displayName` / `mcu` (`rp2040` or `esp32s3`)
- `clock.sysHz`, `flash.method`, `flash.sizeKB` — informational / used by emitters where applicable
- `pins[]`: `{ pin, label, signal, pull?, initial? }`
  - `label` is the stable symbol used in generated macros (`PIN_<LABEL>`)
  - `signal` describes the routing: `gpio_out`, `gpio_in`, `adc0`, `uart0_tx`,
    `i2c0_sda`, `spi0_sck`, `pwm2_b`, ...
- `peripherals[]`: `uart` / `i2c` / `spi` / `pwm` / `adc` entries referencing pin labels
- `leds[]`: `{ name, label, activeLow? }` — `name` becomes a generated macro
  (use `LED_BUILTIN` for the standard blink examples)

Validation runs before every generate: duplicate pins/labels, unknown referenced
labels, out-of-range pins per MCU, and malformed peripheral entries are rejected
with precise messages.

## Development

```bash
npm test             # tsc build + node:test
npm run watch        # tsc -w
```

Layout:

- `src/model.ts` — board model types
- `src/validate.ts` — structural validation
- `src/load.ts` — JSON loading/validation entry point
- `src/emitters/*.ts` — one file per target
- `src/registry.ts` — emitter registry
- `src/cli.ts` — command line interface
- `src/test/*.test.ts` — unit tests (node:test)
