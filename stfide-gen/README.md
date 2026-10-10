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

On regeneration, already existing files are merged: user code between
`USER CODE` markers is preserved (see [USER CODE blocks](#user-code-blocks)).
Pass `--no-merge` to overwrite existing files instead.

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
- `clock.xoscHz` (crystal), `clock.sysHz` (system clock) — informational / used by emitters where applicable
- `flash.method`, `flash.sizeKB` — informational / used by emitters where applicable
- `pins[]`: `{ pin, label, signal, pull?, initial? }`
  - `label` is the stable symbol used in generated macros (`PIN_<LABEL>`)
  - `signal` describes the routing: `gpio_out`, `gpio_in`, `adc0`, `uart0_tx`,
    `i2c0_sda`, `spi0_sck`, `pwm2_b`, `pio0`, `pio1`, ...
- `peripherals[]`: `uart` / `i2c` / `spi` / `pwm` / `adc` / `pio` entries referencing pin labels
  - `pio` (RP2040 only): `{ kind, id ("pio0"|"pio1"), sm (0..3), pin, program?, freqHz? }`.
    The pin signal is `pio0`/`pio1`; the generated code routes the pin to the
    PIO function and leaves the program loading to the application. The
    `program` name is informational (e.g. `"ws2812"`).
- `leds[]`: `{ name, label, activeLow? }` — `name` becomes a generated macro
  (use `LED_BUILTIN` for the standard blink examples)

Validation runs before every generate: duplicate pins/labels, unknown referenced
labels, out-of-range pins per MCU, malformed peripheral entries and bad clock
values are rejected with precise messages. Crystal frequencies that differ from
the MCU default (12 MHz RP2040, 40 MHz ESP32-S3) and overclocked system clocks
produce warnings; the generated code calls out the required SDK configuration.

## USER CODE blocks

The generated `board_init.c` (pico, espidf) and `board_init.cpp` (arduino)
sources contain two marker sections:

```c
/* USER CODE BEGIN includes */
/* USER CODE END includes */

void board_init(void) {
    /* ... generated board setup ... */

    /* USER CODE BEGIN board_init */
    /* USER CODE END board_init */
}
```

Everything between the markers is owned by the user and survives regeneration.
When `generate` finds an existing destination file (and `--no-merge` is not
given), it merges the old file into the new output: content between matching
markers is carried over while everything outside them is refreshed. Sections
that exist only in the old file are dropped, a `BEGIN` without a matching `END`
is ignored, and files without any marker are simply replaced (with a warning).
The CLI prints `merged <path>` for merged files and `wrote <path>` for new or
(thanks to `--no-merge`) freshly overwritten ones.

## Development

```bash
npm test             # tsc build + node:test
npm run watch        # tsc -w
```

Layout:

- `src/model.ts` — board model types
- `src/validate.ts` — structural validation
- `src/load.ts` — JSON loading/validation entry point
- `src/merge.ts` — USER CODE merge for regeneration
- `src/emitters/*.ts` — one file per target
- `src/registry.ts` — emitter registry
- `src/cli.ts` — command line interface
- `src/test/*.test.ts` — unit tests (node:test)
