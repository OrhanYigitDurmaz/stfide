import { BoardModel, Mcu } from '../model';
import {
    banner,
    cString,
    peripheralsOfKind,
    pinMacro,
    requireMcu,
    requirePinNumber,
    sortedPins,
    userCodeBegin,
    userCodeEnd
} from '../util';
import { EmitContext, Emitter, GeneratedFile } from './emitter';

/**
 * Arduino emitter: generates board_config.h / board_init.cpp plus a
 * pins_arduino.h board variant for arduino-pico / arduino-esp32, and a blink
 * example when the board declares at least one LED.
 */

const TARGET = 'arduino';
const SUPPORTED_MCUS: readonly Mcu[] = ['rp2040', 'esp32s3'];

/** Throw a clear error for a peripheral controller id the target cannot map. */
function unsupportedId(board: BoardModel, kind: string, id: string, supported: string[]): never {
    throw new Error(
        `board "${board.name}": arduino emitter does not support ${kind} id "${id}" for mcu ` +
        `"${board.mcu}" (supported: ${supported.join(', ')})`
    );
}

/** STFIDE_BOARD* / PIN_* / LED* defines shared by board_config.h and pins_arduino.h. */
function definesBlock(board: BoardModel): string {
    const lines: string[] = [
        `#define STFIDE_BOARD ${cString(board.name)}`,
        `#define STFIDE_BOARD_NAME ${cString(board.displayName ?? board.name)}`,
        `#define STFIDE_BOARD_MCU ${cString(board.mcu)}`
    ];

    const pins = sortedPins(board);
    if (pins.length > 0) {
        lines.push('');
        for (const pin of pins) {
            lines.push(`#define ${pinMacro(pin.label)} ${pin.pin}`);
        }
    }

    const leds = board.leds ?? [];
    if (leds.length > 0) {
        lines.push('');
        for (const led of leds) {
            requirePinNumber(board, led.label);
            // Arduino.h (or the selected core variant) may already define these
            // macros; the board configuration must win without redefined-macro
            // warnings, so undefine before redefining.
            lines.push(`#undef ${led.name}`);
            lines.push(`#define ${led.name} ${pinMacro(led.label)}`);
            lines.push(`#undef ${led.name}_ACTIVE_LOW`);
            lines.push(`#define ${led.name}_ACTIVE_LOW ${led.activeLow ? 1 : 0}`);
        }
    }

    return lines.join('\n');
}

function boardConfigHeader(board: BoardModel, sourcePath: string): string {
    return [
        banner(TARGET, sourcePath),
        '#pragma once',
        '',
        '#include <Arduino.h>',
        '',
        definesBlock(board),
        '',
        'void boardInit();',
        ''
    ].join('\n');
}

function pinsArduinoHeader(board: BoardModel, sourcePath: string): string {
    return [
        banner(TARGET, sourcePath),
        '#pragma once',
        '',
        `// Board variant for arduino-pico / arduino-esp32 (mcu: ${board.mcu}).`,
        `// Copy into the core's variants/${board.name}/ folder or add its directory to the include path.`,
        '',
        definesBlock(board),
        ''
    ].join('\n');
}

/** GPIO pins (gpio_out / gpio_in) in physical pin order. */
function gpioBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const pin of sortedPins(board)) {
        if (pin.signal === 'gpio_out') {
            lines.push(`pinMode(${pinMacro(pin.label)}, OUTPUT);`);
            if (pin.initial === 'high') {
                lines.push(`digitalWrite(${pinMacro(pin.label)}, HIGH);`);
            } else if (pin.initial === 'low') {
                lines.push(`digitalWrite(${pinMacro(pin.label)}, LOW);`);
            }
        } else if (pin.signal === 'gpio_in') {
            const mode = pin.pull === 'up' ? 'INPUT_PULLUP' : pin.pull === 'down' ? 'INPUT_PULLDOWN' : 'INPUT';
            lines.push(`pinMode(${pinMacro(pin.label)}, ${mode});`);
        }
    }
    return lines;
}

function uartBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const uart of peripheralsOfKind(board, 'uart')) {
        requirePinNumber(board, uart.tx);
        requirePinNumber(board, uart.rx);
        const tx = pinMacro(uart.tx);
        const rx = pinMacro(uart.rx);
        if (board.mcu === 'rp2040') {
            const serial = uart.id === 'uart0' ? 'Serial1'
                : uart.id === 'uart1' ? 'Serial2'
                : unsupportedId(board, 'uart', uart.id, ['uart0', 'uart1']);
            lines.push(`${serial}.setTX(${tx});`);
            lines.push(`${serial}.setRX(${rx});`);
            lines.push(`${serial}.begin(${uart.baud});`);
        } else {
            const serial = uart.id === 'uart0' ? 'Serial'
                : uart.id === 'uart1' ? 'Serial1'
                : unsupportedId(board, 'uart', uart.id, ['uart0', 'uart1']);
            lines.push(`${serial}.begin(${uart.baud}, SERIAL_8N1, ${rx}, ${tx});`);
        }
    }
    return lines;
}

function i2cBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const i2c of peripheralsOfKind(board, 'i2c')) {
        requirePinNumber(board, i2c.sda);
        requirePinNumber(board, i2c.scl);
        const wire = i2c.id === 'i2c0' ? 'Wire'
            : i2c.id === 'i2c1' ? 'Wire1'
            : unsupportedId(board, 'i2c', i2c.id, ['i2c0', 'i2c1']);
        lines.push(`${wire}.setSDA(${pinMacro(i2c.sda)});`);
        lines.push(`${wire}.setSCL(${pinMacro(i2c.scl)});`);
        lines.push(`${wire}.begin();`);
        if (i2c.freqHz !== undefined) {
            lines.push(`${wire}.setClock(${i2c.freqHz});`);
        }
    }
    return lines;
}

function spiBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const spi of peripheralsOfKind(board, 'spi')) {
        requirePinNumber(board, spi.sck);
        if (spi.mosi !== undefined) {
            requirePinNumber(board, spi.mosi);
        }
        if (spi.miso !== undefined) {
            requirePinNumber(board, spi.miso);
        }
        if (board.mcu === 'rp2040') {
            const instance = spi.id === 'spi0' ? 'SPI'
                : spi.id === 'spi1' ? 'SPI1'
                : unsupportedId(board, 'spi', spi.id, ['spi0', 'spi1']);
            lines.push(`${instance}.setSCK(${pinMacro(spi.sck)});`);
            if (spi.mosi !== undefined) {
                lines.push(`${instance}.setTX(${pinMacro(spi.mosi)});`);
            }
            if (spi.miso !== undefined) {
                lines.push(`${instance}.setRX(${pinMacro(spi.miso)});`);
            }
            lines.push(`${instance}.begin();`);
        } else {
            const instance = spi.id === 'spi2' ? 'SPI'
                : spi.id === 'spi3' ? 'SPI1'
                : unsupportedId(board, 'spi', spi.id, ['spi2', 'spi3']);
            const miso = spi.miso !== undefined ? pinMacro(spi.miso) : '-1';
            const mosi = spi.mosi !== undefined ? pinMacro(spi.mosi) : '-1';
            lines.push(`${instance}.begin(${pinMacro(spi.sck)}, ${miso}, ${mosi}, -1);`);
        }
    }
    return lines;
}

function pwmBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const pwm of peripheralsOfKind(board, 'pwm')) {
        requirePinNumber(board, pwm.pin);
        const macro = pinMacro(pwm.pin);
        lines.push(`// PWM output on ${macro} (${pwm.id}): use analogWrite(${macro}, duty)`);
    }
    return lines;
}

function pioBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const pio of peripheralsOfKind(board, 'pio')) {
        requirePinNumber(board, pio.pin);
        lines.push(
            `// PIO on ${pinMacro(pio.pin)} (${pio.id}): not configurable from an Arduino sketch; ` +
            'program the state machine in your sketch'
        );
    }
    return lines;
}

/** Clock notes: an Arduino sketch cannot change the core clock on ESP32-S3. */
function clockBody(board: BoardModel): string[] {
    const sysHz = board.clock?.sysHz;
    if (sysHz === undefined) {
        return [];
    }
    const mhz = sysHz / 1000000;
    if (board.mcu === 'rp2040') {
        if (sysHz === 133000000) {
            return [];
        }
        return [
            `// NOTE: target system clock ${mhz} MHz; call set_sys_clock_khz() after boardInit() ` +
            'if your core does not already do so.'
        ];
    }
    return [`// NOTE: CPU frequency (${mhz} MHz) is configured via the board definition / sdkconfig.`];
}

function adcBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const adc of peripheralsOfKind(board, 'adc')) {
        requirePinNumber(board, adc.pin);
        const macro = pinMacro(adc.pin);
        lines.push(`// ADC input on ${macro} (${adc.id}): use analogRead(${macro})`);
    }
    return lines;
}

function ledBody(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const led of board.leds ?? []) {
        lines.push(`pinMode(${led.name}, OUTPUT);`);
        lines.push(`digitalWrite(${led.name}, ${led.name}_ACTIVE_LOW ? HIGH : LOW);`);
    }
    return lines;
}

interface BodySection {
    title: string;
    lines: string[];
}

/** Indented boardInit() body: one commented section per peripheral family. */
function boardInitBody(board: BoardModel): string[] {
    const sections: BodySection[] = [
        { title: 'Clock', lines: clockBody(board) },
        { title: 'GPIO', lines: gpioBody(board) },
        { title: 'UART', lines: uartBody(board) },
        { title: 'I2C', lines: i2cBody(board) },
        { title: 'SPI', lines: spiBody(board) },
        { title: 'PIO', lines: pioBody(board) },
        { title: 'PWM', lines: pwmBody(board) },
        { title: 'ADC', lines: adcBody(board) },
        { title: 'LEDs', lines: ledBody(board) }
    ];

    const body: string[] = [];
    for (const section of sections) {
        if (section.lines.length === 0) {
            continue;
        }
        if (body.length > 0) {
            body.push('');
        }
        body.push(`    // ${section.title}`);
        for (const line of section.lines) {
            body.push(`    ${line}`);
        }
    }
    return body;
}

function boardInitSource(board: BoardModel, sourcePath: string): string {
    const body = boardInitBody(board);
    if (body.length > 0) {
        body.push('');
    }
    body.push(userCodeBegin('board_init', '    '));
    body.push(userCodeEnd('board_init', '    '));
    return [
        banner(TARGET, sourcePath),
        '#include "board_config.h"',
        '',
        userCodeBegin('includes'),
        userCodeEnd('includes'),
        '',
        'void boardInit() {',
        ...body,
        '}',
        ''
    ].join('\n');
}

function blinkSource(board: BoardModel, sourcePath: string): string {
    const led = (board.leds ?? [])[0];
    if (led === undefined) {
        throw new Error(`board "${board.name}": cannot generate a blink example without an led`);
    }
    return [
        banner(TARGET, sourcePath),
        '#include "board_config.h"',
        '',
        'void setup() {',
        '    boardInit();',
        '}',
        '',
        'void loop() {',
        `    digitalWrite(${led.name}, ${led.name}_ACTIVE_LOW ? LOW : HIGH);`,
        '    delay(500);',
        `    digitalWrite(${led.name}, ${led.name}_ACTIVE_LOW ? HIGH : LOW);`,
        '    delay(500);',
        '}',
        ''
    ].join('\n');
}

export const arduinoEmitter: Emitter = {
    id: TARGET,
    displayName: 'Arduino (arduino-pico / arduino-esp32)',
    supportedMcus: SUPPORTED_MCUS,
    emit(context: EmitContext): GeneratedFile[] {
        const { board, sourcePath } = context;
        requireMcu(board, SUPPORTED_MCUS, TARGET);

        const files: GeneratedFile[] = [
            { path: 'board_config.h', content: boardConfigHeader(board, sourcePath) },
            { path: 'board_init.cpp', content: boardInitSource(board, sourcePath) },
            { path: `variants/${board.name}/pins_arduino.h`, content: pinsArduinoHeader(board, sourcePath) }
        ];

        if ((board.leds ?? []).length > 0) {
            files.push({ path: 'example/blink/blink.ino', content: blinkSource(board, sourcePath) });
            files.push({ path: 'example/blink/board_config.h', content: boardConfigHeader(board, sourcePath) });
        }

        return files;
    }
};
