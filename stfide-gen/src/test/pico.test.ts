import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { loadBoard } from '../load';
import { picoEmitter } from '../emitters/pico';
import { BoardModel } from '../model';

const BOARDS_DIR = path.join(__dirname, '..', '..', '..', 'boards');
const REAL_BOARD = path.join(BOARDS_DIR, 'oc1-rp2040.board.json');
const ESP32_BOARD = path.join(BOARDS_DIR, 'oc1-esp32s3.board.json');

function filesByPath(files: { path: string; content: string }[]): Map<string, string> {
    return new Map(files.map(file => [file.path, file.content]));
}

/** Run fn and return the thrown error message; fail the test if nothing throws. */
function messageOf(fn: () => unknown): string {
    try {
        fn();
    } catch (error) {
        return (error as Error).message;
    }
    assert.fail('expected the emitter to throw');
}

// ---------------------------------------------------------------------------
// Real board
// ---------------------------------------------------------------------------

test('emits the expected files for the real oc1-rp2040 board, deterministically', () => {
    const loaded = loadBoard(REAL_BOARD);

    const first = picoEmitter.emit(loaded);
    const second = picoEmitter.emit(loaded);
    assert.deepStrictEqual(second, first);

    assert.deepStrictEqual(
        first.map(file => file.path),
        ['board_pins.h', 'board_init.h', 'board_init.c', 'example/blink/blink.c']
    );
    assert.ok(first.every(file => file.content.endsWith('\n')));
});

test('real board output configures clock, pins, peripherals and the LED', () => {
    const files = filesByPath(picoEmitter.emit(loadBoard(REAL_BOARD)));
    const pins = files.get('board_pins.h')!;
    const header = files.get('board_init.h')!;
    const init = files.get('board_init.c')!;
    const blink = files.get('example/blink/blink.c')!;

    // board_init.c: clock and peripherals.
    assert.ok(init.includes('set_sys_clock_khz(133000, true);'));
    assert.ok(init.includes('uart_init(uart0, 115200);'));
    assert.ok(init.includes('i2c_init(i2c0, 400000);'));
    assert.ok(init.includes('spi_init(spi0, 1000000);'));
    assert.ok(init.includes('adc_init();'));

    // board_init.c: pin setup uses the PIN_ macros and generic GPIO functions.
    assert.ok(init.includes('gpio_set_function(PIN_DEBUG_TX, GPIO_FUNC_UART);'));
    assert.ok(init.includes('gpio_set_function(PIN_I2C_SDA, GPIO_FUNC_I2C);'));
    assert.ok(init.includes('gpio_pull_up(PIN_I2C_SDA);'));
    assert.ok(init.includes('gpio_set_function(PIN_SPI_SCK, GPIO_FUNC_SPI);'));
    assert.ok(init.includes('gpio_set_dir(PIN_SPI_CS, GPIO_OUT);'));
    assert.ok(init.includes('gpio_put(PIN_SPI_CS, 1);'));
    assert.ok(init.includes('gpio_set_function(PIN_BUZZER, GPIO_FUNC_PWM);'));
    assert.ok(init.includes('gpio_set_dir(PIN_VBUS_SENSE, GPIO_IN);'));
    assert.ok(init.includes('gpio_set_dir(PIN_STATUS_LED, GPIO_OUT);'));
    assert.ok(init.includes('gpio_put(PIN_STATUS_LED, 0);'));
    assert.ok(init.includes('adc_gpio_init(PIN_AIN0);'));
    assert.ok(init.includes('// PWM slice for PIN_BUZZER (pwm2_b):'));

    // Every pin is gpio_init'ed exactly once (the board has 12 pins).
    assert.strictEqual((init.match(/\bgpio_init\(/g) ?? []).length, 12);
    assert.ok(init.includes('gpio_init(PIN_STATUS_LED);'));

    // board_pins.h: sorted defines plus the default LED pin.
    assert.ok(pins.includes('#define PIN_DEBUG_TX 0U'));
    assert.ok(pins.includes('#define PIN_STATUS_LED 25U'));
    assert.ok(pins.includes('#define PIN_AIN0 26U'));
    assert.ok(pins.includes('#define PICO_DEFAULT_LED_PIN PIN_STATUS_LED'));
    assert.ok(pins.indexOf('PIN_DEBUG_TX') < pins.indexOf('PIN_STATUS_LED'));

    // board_init.h: prototype with C++ guards.
    assert.ok(header.includes('extern "C"'));
    assert.ok(header.includes('void board_init(void);'));

    // blink example.
    assert.ok(blink.includes('#include "pico/stdlib.h"'));
    assert.ok(blink.includes('#include "board_init.h"'));
    assert.ok(blink.includes('#include "board_pins.h"'));
    assert.ok(blink.includes('board_init();'));
    assert.ok(blink.includes('gpio_put(PICO_DEFAULT_LED_PIN, 1);'));
    assert.ok(blink.includes('sleep_ms(250);'));
});

// ---------------------------------------------------------------------------
// Golden fixture
// ---------------------------------------------------------------------------

const fixture: BoardModel = {
    version: 1,
    name: 'fixture',
    displayName: 'Golden Fixture',
    mcu: 'rp2040',
    clock: { sysHz: 150000000 },
    pins: [
        { pin: 0, label: 'TX', signal: 'uart0_tx' },
        { pin: 1, label: 'RX', signal: 'uart0_rx' },
        { pin: 4, label: 'SDA', signal: 'i2c0_sda', pull: 'up' },
        { pin: 5, label: 'SCL', signal: 'i2c0_scl', pull: 'up' },
        { pin: 14, label: 'BUTTON', signal: 'gpio_in', pull: 'up' },
        { pin: 15, label: 'LED', signal: 'gpio_out', initial: 'low' },
        { pin: 16, label: 'MISO', signal: 'spi0_rx' },
        { pin: 17, label: 'CS', signal: 'gpio_out', initial: 'high' },
        { pin: 18, label: 'SCK', signal: 'spi0_sck' },
        { pin: 19, label: 'MOSI', signal: 'spi0_tx' },
        { pin: 21, label: 'FAN', signal: 'pwm2_b' },
        { pin: 26, label: 'SENSE', signal: 'adc0' }
    ],
    peripherals: [
        { kind: 'uart', id: 'uart0', baud: 9600, tx: 'TX', rx: 'RX' },
        { kind: 'i2c', id: 'i2c0', sda: 'SDA', scl: 'SCL' },
        { kind: 'spi', id: 'spi0', sck: 'SCK', mosi: 'MOSI', miso: 'MISO' },
        { kind: 'pwm', id: 'pwm2_b', pin: 'FAN' },
        { kind: 'adc', id: 'adc0', pin: 'SENSE' }
    ],
    leds: [{ name: 'LED_BUILTIN', label: 'LED' }]
};

const FIXTURE_RULE = `// ${'-'.repeat(45)}`;
const FIXTURE_BANNER = [
    FIXTURE_RULE,
    '// GENERATED FILE - DO NOT EDIT.',
    '// Produced by stfide-gen for target "pico".',
    '// Source: fixture.board.json',
    FIXTURE_RULE
].join('\n');

const EXPECTED_PINS_H = [
    FIXTURE_BANNER,
    '#pragma once',
    '',
    '#define PIN_TX 0U',
    '#define PIN_RX 1U',
    '#define PIN_SDA 4U',
    '#define PIN_SCL 5U',
    '#define PIN_BUTTON 14U',
    '#define PIN_LED 15U',
    '#define PIN_MISO 16U',
    '#define PIN_CS 17U',
    '#define PIN_SCK 18U',
    '#define PIN_MOSI 19U',
    '#define PIN_FAN 21U',
    '#define PIN_SENSE 26U',
    '',
    '#define PICO_DEFAULT_LED_PIN PIN_LED // on-board LED: LED',
    ''
].join('\n');

const EXPECTED_INIT_C = [
    FIXTURE_BANNER,
    '',
    '#include "pico/stdlib.h"',
    '#include "board_init.h"',
    '#include "board_pins.h"',
    '#include "hardware/clocks.h"',
    '#include "hardware/gpio.h"',
    '#include "hardware/uart.h"',
    '#include "hardware/i2c.h"',
    '#include "hardware/spi.h"',
    '#include "hardware/pwm.h"',
    '#include "hardware/adc.h"',
    '',
    'void board_init(void) {',
    '    set_sys_clock_khz(150000, true);',
    '',
    '    gpio_init(PIN_TX);',
    '    gpio_init(PIN_RX);',
    '    gpio_init(PIN_SDA);',
    '    gpio_init(PIN_SCL);',
    '    gpio_init(PIN_BUTTON);',
    '    gpio_init(PIN_LED);',
    '    gpio_init(PIN_MISO);',
    '    gpio_init(PIN_CS);',
    '    gpio_init(PIN_SCK);',
    '    gpio_init(PIN_MOSI);',
    '    gpio_init(PIN_FAN);',
    '    gpio_init(PIN_SENSE);',
    '',
    '    gpio_set_function(PIN_TX, GPIO_FUNC_UART);',
    '    gpio_set_function(PIN_RX, GPIO_FUNC_UART);',
    '    gpio_set_function(PIN_SDA, GPIO_FUNC_I2C);',
    '    gpio_pull_up(PIN_SDA);',
    '    gpio_set_function(PIN_SCL, GPIO_FUNC_I2C);',
    '    gpio_pull_up(PIN_SCL);',
    '    gpio_set_dir(PIN_BUTTON, GPIO_IN);',
    '    gpio_pull_up(PIN_BUTTON);',
    '    gpio_set_dir(PIN_LED, GPIO_OUT);',
    '    gpio_put(PIN_LED, 0);',
    '    gpio_set_function(PIN_MISO, GPIO_FUNC_SPI);',
    '    gpio_set_dir(PIN_CS, GPIO_OUT);',
    '    gpio_put(PIN_CS, 1);',
    '    gpio_set_function(PIN_SCK, GPIO_FUNC_SPI);',
    '    gpio_set_function(PIN_MOSI, GPIO_FUNC_SPI);',
    '    gpio_set_function(PIN_FAN, GPIO_FUNC_PWM);',
    '    adc_gpio_init(PIN_SENSE);',
    '',
    '    adc_init();',
    '',
    '    uart_init(uart0, 9600);',
    '    i2c_init(i2c0, 100000);',
    '    spi_init(spi0, 1000000);',
    '    // PWM slice for PIN_FAN (pwm2_b): configure with pwm_set_wrap()/pwm_set_chan_level() in the application',
    '}',
    ''
].join('\n');

test('golden fixture: board_pins.h matches byte for byte', () => {
    const files = filesByPath(picoEmitter.emit({ board: fixture, sourcePath: 'fixture.board.json' }));
    assert.strictEqual(files.get('board_pins.h'), EXPECTED_PINS_H);
});

test('golden fixture: board_init.c matches byte for byte', () => {
    const files = filesByPath(picoEmitter.emit({ board: fixture, sourcePath: 'fixture.board.json' }));
    assert.strictEqual(files.get('board_init.c'), EXPECTED_INIT_C);
});

test('golden fixture: emits the blink example when an LED is declared', () => {
    const files = filesByPath(picoEmitter.emit({ board: fixture, sourcePath: 'fixture.board.json' }));
    const blink = files.get('example/blink/blink.c')!;
    assert.ok(blink.includes('#include "pico/stdlib.h"'));
    assert.ok(blink.includes('board_init();'));
    assert.ok(blink.includes('gpio_put(PICO_DEFAULT_LED_PIN, 1);'));
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

test('rejects a signal that is not routed to the pin (uart0_tx on GPIO2)', () => {
    const board: BoardModel = {
        version: 1,
        name: 'bad-uart',
        mcu: 'rp2040',
        pins: [{ pin: 2, label: 'TX', signal: 'uart0_tx' }]
    };
    const message = messageOf(() => picoEmitter.emit({ board, sourcePath: 'bad.board.json' }));
    assert.ok(message.includes('uart0_tx'), message);
    assert.ok(message.includes('pin 2'), message);
    assert.ok(message.includes('uart0_cts'), message); // allowed token on GPIO2
    assert.ok(message.includes('allowed'), message);
});

test('rejects adc0 on a pin without ADC capability (GPIO25)', () => {
    const board: BoardModel = {
        version: 1,
        name: 'bad-adc',
        mcu: 'rp2040',
        pins: [{ pin: 25, label: 'LED', signal: 'adc0' }]
    };
    const message = messageOf(() => picoEmitter.emit({ board, sourcePath: 'bad.board.json' }));
    assert.ok(message.includes('adc0'), message);
    assert.ok(message.includes('spi1_csn'), message); // allowed token on GPIO25
});

test('rejects pins outside the RP2040 range', () => {
    const board: BoardModel = {
        version: 1,
        name: 'bad-pin',
        mcu: 'rp2040',
        pins: [{ pin: 99, label: 'NOPE', signal: 'gpio_out' }]
    };
    const message = messageOf(() => picoEmitter.emit({ board, sourcePath: 'bad.board.json' }));
    assert.ok(message.includes('pin 99'), message);
    assert.ok(message.includes('out of range'), message);
});

test('rejects a system clock that is not a multiple of 1 kHz', () => {
    const board: BoardModel = { ...fixture, clock: { sysHz: 133000500 } };
    const message = messageOf(() => picoEmitter.emit({ board, sourcePath: 'fixture.board.json' }));
    assert.ok(message.includes('133000500'), message);
    assert.ok(message.includes('1000'), message);
});

test('rejects unsupported peripheral ids', () => {
    const board: BoardModel = {
        ...fixture,
        peripherals: [{ kind: 'uart', id: 'uart2', baud: 9600, tx: 'TX', rx: 'RX' }]
    };
    const message = messageOf(() => picoEmitter.emit({ board, sourcePath: 'fixture.board.json' }));
    assert.ok(message.includes('uart2'), message);
    assert.ok(message.includes('uart0 or uart1'), message);
});

test('rejects a board for another MCU (esp32s3)', () => {
    const loaded = loadBoard(ESP32_BOARD);
    const message = messageOf(() => picoEmitter.emit(loaded));
    assert.ok(message.includes('esp32s3'), message);
    assert.ok(message.includes('pico'), message);
});

// ---------------------------------------------------------------------------
// Boards without LEDs
// ---------------------------------------------------------------------------

test('omits the blink example when the board has no LEDs', () => {
    const board: BoardModel = { ...fixture, leds: [] };
    const files = picoEmitter.emit({ board, sourcePath: 'fixture.board.json' });
    assert.deepStrictEqual(
        files.map(file => file.path),
        ['board_pins.h', 'board_init.h', 'board_init.c']
    );
    assert.ok(!files[0].content.includes('PICO_DEFAULT_LED_PIN'));
});
