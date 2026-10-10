import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { loadBoard } from '../load';
import { mergeUserCode } from '../merge';
import { arduinoEmitter } from '../emitters/arduino';
import { GeneratedFile } from '../emitters/emitter';
import { BoardModel, PeripheralDef } from '../model';

const BOARDS_DIR = path.join(__dirname, '..', '..', '..', 'boards');
const RP2040_BOARD = path.join(BOARDS_DIR, 'oc1-rp2040.board.json');
const ESP32S3_BOARD = path.join(BOARDS_DIR, 'oc1-esp32s3.board.json');

const RP2040_FILES = [
    'board_config.h',
    'board_init.cpp',
    'variants/oc1-rp2040/pins_arduino.h',
    'example/blink/blink.ino',
    'example/blink/board_config.h'
].sort();

const ESP32S3_FILES = [
    'board_config.h',
    'board_init.cpp',
    'variants/oc1-esp32s3/pins_arduino.h',
    'example/blink/blink.ino',
    'example/blink/board_config.h'
].sort();

function fileByPath(files: GeneratedFile[], filePath: string): GeneratedFile {
    const file = files.find(candidate => candidate.path === filePath);
    assert.ok(file, `expected generated file "${filePath}" (got: ${files.map(f => f.path).join(', ')})`);
    return file;
}

function pathsOf(files: GeneratedFile[]): string[] {
    return files.map(file => file.path).sort();
}

function cloneBoard(board: BoardModel): BoardModel {
    return JSON.parse(JSON.stringify(board)) as BoardModel;
}

function withPeripheralId(board: BoardModel, kind: PeripheralDef['kind'], id: string): BoardModel {
    const clone = cloneBoard(board);
    clone.peripherals = (clone.peripherals ?? []).map(peripheral =>
        ({ ...peripheral, id }) as PeripheralDef
    );
    return clone;
}

test('oc1-rp2040: expected files and deterministic output', () => {
    const loaded = loadBoard(RP2040_BOARD);
    const context = { board: loaded.board, sourcePath: loaded.sourcePath };

    const files = arduinoEmitter.emit(context);
    const again = arduinoEmitter.emit(context);
    assert.deepStrictEqual(again, files);

    assert.deepStrictEqual(pathsOf(files), RP2040_FILES);

    const config = fileByPath(files, 'board_config.h').content;
    assert.ok(config.includes('#define STFIDE_BOARD "oc1-rp2040"'));
    assert.ok(config.includes('#define STFIDE_BOARD_NAME "OC1 RP2040 Card"'));
    assert.ok(config.includes('#define STFIDE_BOARD_MCU "rp2040"'));
    assert.ok(config.includes('#define PIN_DEBUG_TX 0'));
    const undefLed = config.indexOf('#undef LED_BUILTIN');
    assert.ok(undefLed >= 0, 'expected the led macro to be undefined before redefinition');
    const ledSequence = '#undef LED_BUILTIN\n#define LED_BUILTIN PIN_STATUS_LED\n#undef LED_BUILTIN_ACTIVE_LOW\n#define LED_BUILTIN_ACTIVE_LOW 0';
    assert.strictEqual(config.slice(undefLed, undefLed + ledSequence.length), ledSequence);
    assert.ok(config.includes('#define LED_BUILTIN PIN_STATUS_LED'));
    assert.ok(config.includes('#define LED_BUILTIN_ACTIVE_LOW 0'));
    assert.ok(config.includes('void boardInit();'));

    const init = fileByPath(files, 'board_init.cpp').content;
    let previousIndex = -1;
    for (const header of ['    // GPIO', '    // UART', '    // I2C', '    // SPI', '    // PIO', '    // PWM', '    // ADC', '    // LEDs']) {
        const index = init.indexOf(header);
        assert.ok(index > previousIndex, `expected indented section header ${JSON.stringify(header)}`);
        previousIndex = index;
    }
    assert.ok(init.includes('Serial1.setTX(PIN_DEBUG_TX);'));
    assert.ok(init.includes('Serial1.begin(115200);'));
    assert.ok(init.includes('Wire.setClock(400000);'));
    assert.ok(init.includes('SPI.setTX(PIN_SPI_MOSI);'));
    assert.ok(
        init.includes(
            '// PIO on PIN_LED_STRIP (pio0): not configurable from an Arduino sketch; ' +
            'program the state machine in your sketch'
        )
    );
    assert.ok(init.includes('// PWM output on PIN_BUZZER (pwm2_b): use analogWrite(PIN_BUZZER, duty)'));
    assert.ok(init.includes('// ADC input on PIN_AIN0 (adc0): use analogRead(PIN_AIN0)'));
    assert.ok(init.includes('digitalWrite(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? HIGH : LOW);'));

    // USER CODE markers: includes after the standard includes, board_init at
    // the end of the boardInit() body.
    assert.ok(init.includes('#include "board_config.h"\n\n/* USER CODE BEGIN includes */\n/* USER CODE END includes */\n'));
    assert.ok(init.includes('\n    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */\n}'));
    // Stock 133 MHz clock: no clock note for the real board.
    assert.ok(!init.includes('target system clock'));

    const variant = fileByPath(files, 'variants/oc1-rp2040/pins_arduino.h').content;
    assert.ok(variant.includes('#pragma once'));
    assert.ok(variant.includes('#define STFIDE_BOARD "oc1-rp2040"'));
    assert.ok(variant.includes('#define PIN_DEBUG_TX 0'));
    assert.ok(variant.includes('#undef LED_BUILTIN\n#define LED_BUILTIN PIN_STATUS_LED'));
    assert.ok(!variant.includes('#include <Arduino.h>'));
    assert.ok(!variant.includes('void boardInit();'));

    const blink = fileByPath(files, 'example/blink/blink.ino').content;
    assert.ok(blink.includes('boardInit();'));
    assert.ok(blink.includes('digitalWrite(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? LOW : HIGH);'));
    assert.ok(blink.includes('digitalWrite(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? HIGH : LOW);'));

    const blinkConfig = fileByPath(files, 'example/blink/board_config.h').content;
    assert.strictEqual(blinkConfig, config);
});

test('oc1-esp32s3: expected files and deterministic output', () => {
    const loaded = loadBoard(ESP32S3_BOARD);
    const context = { board: loaded.board, sourcePath: loaded.sourcePath };

    const files = arduinoEmitter.emit(context);
    const again = arduinoEmitter.emit(context);
    assert.deepStrictEqual(again, files);

    assert.deepStrictEqual(pathsOf(files), ESP32S3_FILES);

    const config = fileByPath(files, 'board_config.h').content;
    assert.ok(config.includes('#define STFIDE_BOARD "oc1-esp32s3"'));
    assert.ok(config.includes('#define PIN_DEBUG_TX 43'));

    const init = fileByPath(files, 'board_init.cpp').content;
    assert.ok(init.includes('Serial.begin(115200, SERIAL_8N1, PIN_DEBUG_RX, PIN_DEBUG_TX);'));
    assert.ok(init.includes('SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, -1);'));
    assert.ok(
        init.includes(
            '// NOTE: CPU frequency (240 MHz) is configured via the board definition / sdkconfig.'
        )
    );
    // No PIO on this board.
    assert.ok(!init.includes('// PIO'));

    assert.ok(fileByPath(files, 'variants/oc1-esp32s3/pins_arduino.h').content.includes('#pragma once'));
});

// Small fixture used for the full-file golden check.
const fixtureBoard: BoardModel = {
    version: 1,
    name: 'fixture',
    displayName: 'Fixture Board',
    mcu: 'rp2040',
    pins: [
        { pin: 4, label: 'TX', signal: 'uart0_tx' },
        { pin: 5, label: 'RX', signal: 'uart0_rx' },
        { pin: 3, label: 'BTN', signal: 'gpio_in', pull: 'up' },
        { pin: 2, label: 'LED_PIN', signal: 'gpio_out', initial: 'high' }
    ],
    peripherals: [
        { kind: 'uart', id: 'uart0', baud: 9600, tx: 'TX', rx: 'RX' }
    ],
    leds: [
        { name: 'LED_RED', label: 'LED_PIN' }
    ]
};

const expectedFixtureConfig = [
    `// ${'-'.repeat(48)}`,
    '// GENERATED FILE - DO NOT EDIT.',
    '// Produced by stfide-gen for target "arduino".',
    '// Source: fixture.board.json',
    `// ${'-'.repeat(48)}`,
    '#pragma once',
    '',
    '#include <Arduino.h>',
    '',
    '#define STFIDE_BOARD "fixture"',
    '#define STFIDE_BOARD_NAME "Fixture Board"',
    '#define STFIDE_BOARD_MCU "rp2040"',
    '',
    '#define PIN_LED_PIN 2',
    '#define PIN_BTN 3',
    '#define PIN_TX 4',
    '#define PIN_RX 5',
    '',
    '#undef LED_RED',
    '#define LED_RED PIN_LED_PIN',
    '#undef LED_RED_ACTIVE_LOW',
    '#define LED_RED_ACTIVE_LOW 0',
    '',
    'void boardInit();',
    ''
].join('\n');

test('fixture: board_config.h golden equality', () => {
    const files = arduinoEmitter.emit({ board: fixtureBoard, sourcePath: 'fixture.board.json' });
    assert.strictEqual(fileByPath(files, 'board_config.h').content, expectedFixtureConfig);
});

test('rejects unsupported peripheral controller ids', () => {
    const loaded = loadBoard(RP2040_BOARD);
    const cases = [
        ['uart', 'uart7'],
        ['i2c', 'i2c9'],
        ['spi', 'spi9']
    ] as const;
    for (const [kind, id] of cases) {
        const board = withPeripheralId(loaded.board, kind, id);
        assert.throws(
            () => arduinoEmitter.emit({ board, sourcePath: loaded.sourcePath }),
            new RegExp(id),
            `expected ${kind} id "${id}" to be rejected`
        );
    }
});

test('board without leds emits no blink example', () => {
    const loaded = loadBoard(RP2040_BOARD);
    const board = cloneBoard(loaded.board);
    board.leds = [];

    const files = arduinoEmitter.emit({ board, sourcePath: loaded.sourcePath });

    assert.deepStrictEqual(pathsOf(files), [
        'board_config.h',
        'board_init.cpp',
        'variants/oc1-rp2040/pins_arduino.h'
    ]);
    assert.ok(!files.some(file => file.path.startsWith('example/')));

    const config = fileByPath(files, 'board_config.h').content;
    assert.ok(!config.includes('LED_BUILTIN'));

    const init = fileByPath(files, 'board_init.cpp').content;
    assert.ok(!init.includes('LED_BUILTIN'));
});

// ---------------------------------------------------------------------------
// Clock notes
// ---------------------------------------------------------------------------

function initOf(board: BoardModel): string {
    return fileByPath(arduinoEmitter.emit({ board, sourcePath: 'clock.board.json' }), 'board_init.cpp').content;
}

test('rp2040: non-stock system clock emits a set_sys_clock_khz note', () => {
    const board = cloneBoard(fixtureBoard);
    board.clock = { sysHz: 150000000 };
    const init = initOf(board);
    assert.ok(
        init.includes(
            '// NOTE: target system clock 150 MHz; call set_sys_clock_khz() after boardInit() ' +
            'if your core does not already do so.'
        )
    );
    assert.ok(init.includes('    // Clock\n'));

    board.clock = { sysHz: 133000000 };
    const stockInit = initOf(board);
    assert.ok(!stockInit.includes('// NOTE:'));
    assert.ok(!stockInit.includes('    // Clock'));
});

test('esp32s3: system clock emits the sdkconfig note', () => {
    const loaded = loadBoard(ESP32S3_BOARD);
    const board = cloneBoard(loaded.board);
    board.clock = { sysHz: 160000000 };
    assert.ok(
        initOf(board).includes(
            '// NOTE: CPU frequency (160 MHz) is configured via the board definition / sdkconfig.'
        )
    );
});

// ---------------------------------------------------------------------------
// USER CODE merge
// ---------------------------------------------------------------------------

test('regeneration merge keeps user code in board_init.cpp', () => {
    const first = initOf(cloneBoard(fixtureBoard));
    const edited = first
        .replace(
            '/* USER CODE BEGIN includes */\n/* USER CODE END includes */',
            '/* USER CODE BEGIN includes */\n#include "user_extra.h"\n/* USER CODE END includes */'
        )
        .replace(
            '    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */',
            '    /* USER CODE BEGIN board_init */\n    startUserTask();\n    /* USER CODE END board_init */'
        );
    const regenerated = mergeUserCode(first, edited);
    assert.ok(regenerated.includes('#include "user_extra.h"'));
    assert.ok(regenerated.includes('    startUserTask();'));
    assert.ok(regenerated.includes('Serial1.begin(9600);'));
});
