import { BoardModel, I2cDef, PinDef, PinPull, SpiDef, UartDef } from '../model';
import {
    banner,
    findPinByLabel,
    peripheralsOfKind,
    pinMacro,
    requireMcu,
    sortedPins
} from '../util';
import { EmitContext, Emitter, GeneratedFile } from './emitter';

/**
 * ESP-IDF emitter: generates board_pins.h / board_init.h / board_init.c for
 * ESP32-S3 boards.
 *
 * Peripheral signals are routed through the ESP32-S3 GPIO matrix, so UART /
 * I2C / SPI pins are configured by their drivers; only plain gpio_out/gpio_in
 * pins (and explicit pulls on peripheral pins) are handled directly here.
 */

const TARGET = 'espidf';
const SUPPORTED_MCUS = ['esp32s3'] as const;

/** Pins wired to the on-module SPI flash on common ESP32-S3 modules. */
const RESERVED_PIN_MIN = 26;
const RESERVED_PIN_MAX = 32;

const GPIO_MATRIX_NOTE =
    '    // ESP32-S3 routes peripheral signals to pins via the GPIO matrix; any pin can take any signal.';

/** Resolve a pin label to its definition; throws with the same wording as util.requirePinNumber. */
function requirePinDef(board: BoardModel, label: string): PinDef {
    const pin = findPinByLabel(board, label);
    if (!pin) {
        throw new Error(`board "${board.name}": no pin with label "${label}"`);
    }
    return pin;
}

function pullUpMacro(pull: PinPull | undefined): string {
    return pull === 'up' ? 'GPIO_PULLUP_ENABLE' : 'GPIO_PULLUP_DISABLE';
}

function pullDownMacro(pull: PinPull | undefined): string {
    return pull === 'down' ? 'GPIO_PULLDOWN_ENABLE' : 'GPIO_PULLDOWN_DISABLE';
}

/** Append the shared-`io_conf` GPIO configuration statements for one pin. */
function pushGpioConfig(out: string[], pin: PinDef, initial: 'high' | 'low' | undefined): void {
    out.push(`    io_conf.pin_bit_mask = 1ULL << ${pinMacro(pin.label)};`);
    out.push('    io_conf.mode = GPIO_MODE_OUTPUT | GPIO_MODE_INPUT;');
    out.push(`    io_conf.pull_up_en = ${pullUpMacro(pin.pull)};`);
    out.push(`    io_conf.pull_down_en = ${pullDownMacro(pin.pull)};`);
    out.push('    io_conf.intr_type = GPIO_INTR_DISABLE;');
    out.push('    ESP_ERROR_CHECK(gpio_config(&io_conf));');
    if (initial !== undefined) {
        out.push(`    ESP_ERROR_CHECK(gpio_set_level(${pinMacro(pin.label)}, ${initial === 'high' ? '1' : '0'}));`);
    }
}

function uartPort(board: BoardModel, id: string): string {
    switch (id) {
        case 'uart0':
            return 'UART_NUM_0';
        case 'uart1':
            return 'UART_NUM_1';
        default:
            throw new Error(
                `board "${board.name}": uart id "${id}" is not supported by the espidf target (expected "uart0" or "uart1")`
            );
    }
}

function i2cPort(board: BoardModel, id: string): string {
    switch (id) {
        case 'i2c0':
            return 'I2C_NUM_0';
        case 'i2c1':
            return 'I2C_NUM_1';
        default:
            throw new Error(
                `board "${board.name}": i2c id "${id}" is not supported by the espidf target (expected "i2c0" or "i2c1")`
            );
    }
}

function spiHost(board: BoardModel, id: string): string {
    switch (id) {
        case 'spi2':
            return 'SPI2_HOST';
        case 'spi3':
            return 'SPI3_HOST';
        default:
            throw new Error(
                `board "${board.name}": spi id "${id}" is not supported by the espidf target (expected "spi2" or "spi3")`
            );
    }
}

/** Pins 26..32 are wired to the on-module SPI flash and cannot be used as GPIO. */
function checkReservedPins(board: BoardModel): void {
    for (const pin of sortedPins(board)) {
        if (pin.pin >= RESERVED_PIN_MIN && pin.pin <= RESERVED_PIN_MAX) {
            throw new Error(
                `board "${board.name}": pin ${pin.pin} ("${pin.label}") is reserved for the SPI flash on common ` +
                `ESP32-S3 modules (pins ${RESERVED_PIN_MIN}..${RESERVED_PIN_MAX} cannot be used)`
            );
        }
    }
}

function emitBoardPinsH(board: BoardModel, sourcePath: string): GeneratedFile {
    const lines: string[] = [banner(TARGET, sourcePath), '#pragma once', ''];
    for (const pin of sortedPins(board)) {
        lines.push(`#define ${pinMacro(pin.label)} ${pin.pin}`);
    }
    const leds = board.leds ?? [];
    if (leds.length > 0) {
        lines.push('');
        for (const led of leds) {
            lines.push(`#define ${led.name} ${pinMacro(led.label)}`);
            lines.push(`#define ${led.name}_ACTIVE_LOW ${led.activeLow ? 1 : 0}`);
        }
    }
    return { path: 'board_pins.h', content: `${lines.join('\n')}\n` };
}

/** Blink example; requires at least one led (the first declared one is used). */
function emitBlinkExample(board: BoardModel, sourcePath: string): GeneratedFile {
    const led = (board.leds ?? [])[0];
    if (!led) {
        throw new Error(`board "${board.name}": the blink example requires at least one led`);
    }
    const name = led.name;
    const lines = [
        banner(TARGET, sourcePath),
        '',
        '// Add this file plus board_init.c / board_init.h / board_pins.h to your',
        '// ESP-IDF project (e.g. as a component); app_main() is the application entry point.',
        '',
        '#include "freertos/FreeRTOS.h"',
        '#include "freertos/task.h"',
        '#include "driver/gpio.h"',
        '#include "board_init.h"',
        '#include "board_pins.h"',
        '',
        'void app_main(void) {',
        '    board_init();',
        '    while (true) {',
        `        gpio_set_level(${name}, ${name}_ACTIVE_LOW ? 0 : 1);   // on`,
        '        vTaskDelay(pdMS_TO_TICKS(250));',
        `        gpio_set_level(${name}, ${name}_ACTIVE_LOW ? 1 : 0);   // off`,
        '        vTaskDelay(pdMS_TO_TICKS(250));',
        '    }',
        '}'
    ];
    return { path: 'example/blink/blink.c', content: `${lines.join('\n')}\n` };
}

function emitBoardInitH(sourcePath: string): GeneratedFile {
    const lines = [
        banner(TARGET, sourcePath),
        '#pragma once',
        '',
        '#ifdef __cplusplus',
        'extern "C" {',
        '#endif',
        '',
        '/** Initialize all board pins, clocks and peripherals. */',
        'void board_init(void);',
        '',
        '#ifdef __cplusplus',
        '}',
        '#endif'
    ];
    return { path: 'board_init.h', content: `${lines.join('\n')}\n` };
}

function uartBlock(board: BoardModel, uart: UartDef): string[] {
    const port = uartPort(board, uart.id);
    const name = `${uart.id}_config`;
    return [
        `    uart_config_t ${name} = {`,
        `        .baud_rate = ${uart.baud},`,
        '        .data_bits = UART_DATA_8_BITS,',
        '        .parity = UART_PARITY_DISABLE,',
        '        .stop_bits = UART_STOP_BITS_1,',
        '        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,',
        '        .source_clk = UART_SCLK_DEFAULT',
        '    };',
        `    ESP_ERROR_CHECK(uart_param_config(${port}, &${name}));`,
        `    ESP_ERROR_CHECK(uart_set_pin(${port}, ${pinMacro(uart.tx)}, ${pinMacro(uart.rx)}, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));`,
        `    ESP_ERROR_CHECK(uart_driver_install(${port}, 256, 256, 0, NULL, 0));`
    ];
}

function i2cBlock(board: BoardModel, i2c: I2cDef): string[] {
    const port = i2cPort(board, i2c.id);
    const name = `${i2c.id}_config`;
    return [
        `    i2c_config_t ${name} = {`,
        '        .mode = I2C_MODE_MASTER,',
        `        .sda_io_num = ${pinMacro(i2c.sda)},`,
        `        .scl_io_num = ${pinMacro(i2c.scl)},`,
        '        .sda_pullup_en = GPIO_PULLUP_ENABLE,',
        '        .scl_pullup_en = GPIO_PULLUP_ENABLE,',
        `        .master.clk_speed = ${i2c.freqHz ?? 100000}`,
        '    };',
        `    ESP_ERROR_CHECK(i2c_param_config(${port}, &${name}));`,
        `    ESP_ERROR_CHECK(i2c_driver_install(${port}, I2C_MODE_MASTER, 0, 0, 0));`
    ];
}

function spiBlock(board: BoardModel, spi: SpiDef, scoped: boolean): string[] {
    const host = spiHost(board, spi.id);
    // With a single SPI bus the config keeps the conventional name; several
    // buses reuse the same name inside scoped blocks to avoid collisions.
    const lines: string[] = [];
    const indent = scoped ? '        ' : '    ';
    if (scoped) {
        lines.push('    {');
    }
    lines.push(`${indent}spi_bus_config_t buscfg = {`);
    lines.push(`${indent}    .mosi_io_num = ${spi.mosi !== undefined ? pinMacro(spi.mosi) : '-1'},`);
    lines.push(`${indent}    .miso_io_num = ${spi.miso !== undefined ? pinMacro(spi.miso) : '-1'},`);
    lines.push(`${indent}    .sclk_io_num = ${pinMacro(spi.sck)},`);
    lines.push(`${indent}    .quadwp_io_num = -1,`);
    lines.push(`${indent}    .quadhd_io_num = -1,`);
    lines.push(`${indent}    .max_transfer_sz = 4096`);
    lines.push(`${indent}};`);
    lines.push(`${indent}ESP_ERROR_CHECK(spi_bus_initialize(${host}, &buscfg, SPI_DMA_CH_AUTO));`);
    if (scoped) {
        lines.push('    }');
    }
    return lines;
}

function emitBoardInitC(board: BoardModel, sourcePath: string): GeneratedFile {
    const pins = sortedPins(board);
    const uarts = peripheralsOfKind(board, 'uart');
    const i2cs = peripheralsOfKind(board, 'i2c');
    const spis = peripheralsOfKind(board, 'spi');
    const pwms = peripheralsOfKind(board, 'pwm');
    const adcs = peripheralsOfKind(board, 'adc');
    const leds = board.leds ?? [];

    const gpioPins = pins.filter(pin => pin.signal === 'gpio_out' || pin.signal === 'gpio_in');

    // LEDs whose pin is not a plain gpio_out get their own configuration, as if
    // they were gpio_out with the pin's initial level (default: low).
    const ledConfigs: { pin: PinDef; initial: 'high' | 'low' }[] = [];
    for (const led of leds) {
        const pin = requirePinDef(board, led.label);
        if (pin.signal !== 'gpio_out') {
            ledConfigs.push({ pin, initial: pin.initial === 'high' ? 'high' : 'low' });
        }
    }

    // UART/I2C/SPI pins are routed by their drivers, but explicit pulls on them
    // must still be applied manually.
    const peripheralLabels = new Set<string>();
    for (const uart of uarts) {
        peripheralLabels.add(uart.tx.toUpperCase());
        peripheralLabels.add(uart.rx.toUpperCase());
    }
    for (const i2c of i2cs) {
        peripheralLabels.add(i2c.sda.toUpperCase());
        peripheralLabels.add(i2c.scl.toUpperCase());
    }
    for (const spi of spis) {
        for (const label of [spi.sck, spi.mosi, spi.miso]) {
            if (label !== undefined) {
                peripheralLabels.add(label.toUpperCase());
            }
        }
    }
    const pullPins = pins.filter(
        pin => peripheralLabels.has(pin.label.toUpperCase()) && (pin.pull === 'up' || pin.pull === 'down')
    );

    const needsGpio = gpioPins.length > 0 || ledConfigs.length > 0 || pullPins.length > 0;

    const includes: string[] = ['#include "board_init.h"', '#include "board_pins.h"', ''];
    if (needsGpio) {
        includes.push('#include "driver/gpio.h"');
    }
    if (uarts.length > 0) {
        includes.push('#include "driver/uart.h"');
    }
    if (i2cs.length > 0) {
        includes.push('#include "driver/i2c.h"');
    }
    if (spis.length > 0) {
        includes.push('#include "driver/spi_master.h"');
    }
    includes.push('#include "esp_err.h"');

    const blocks: string[][] = [];

    const top: string[] = [GPIO_MATRIX_NOTE];
    if (board.clock?.sysHz !== undefined) {
        const mhz = Math.round(board.clock.sysHz / 1000000);
        top.push(`    // System clock: set CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ via sdkconfig (target ${mhz} MHz)`);
    }
    blocks.push(top);

    if (gpioPins.length > 0 || ledConfigs.length > 0) {
        const gpioBlock: string[] = ['    gpio_config_t io_conf = {};'];
        gpioPins.forEach((pin, index) => {
            if (index > 0) {
                gpioBlock.push('');
            }
            const initial =
                pin.signal === 'gpio_out' && (pin.initial === 'high' || pin.initial === 'low')
                    ? pin.initial
                    : undefined;
            pushGpioConfig(gpioBlock, pin, initial);
        });
        blocks.push(gpioBlock);
    }

    if (pullPins.length > 0) {
        blocks.push(
            pullPins.map(
                pin =>
                    `    ESP_ERROR_CHECK(gpio_set_pull_mode(${pinMacro(pin.label)}, ${
                        pin.pull === 'up' ? 'GPIO_PULLUP_ONLY' : 'GPIO_PULLDOWN_ONLY'
                    }));`
            )
        );
    }

    for (const uart of uarts) {
        blocks.push(uartBlock(board, uart));
    }
    for (const i2c of i2cs) {
        blocks.push(i2cBlock(board, i2c));
    }
    const scopedSpi = spis.length > 1;
    for (const spi of spis) {
        blocks.push(spiBlock(board, spi, scopedSpi));
    }

    if (pwms.length > 0) {
        blocks.push(
            pwms.map(
                pwm =>
                    `    // PWM on ${pinMacro(pwm.pin)} (${pwm.id}): use the LEDC driver (ledc_timer_config/ledc_channel_config)`
            )
        );
    }
    if (adcs.length > 0) {
        blocks.push(
            adcs.map(
                adc =>
                    `    // ADC on ${pinMacro(adc.pin)} (${adc.id}): use the One-Shot ADC driver (adc_oneshot_new_unit)`
            )
        );
    }

    if (ledConfigs.length > 0) {
        const ledBlock: string[] = [];
        ledConfigs.forEach((config, index) => {
            if (index > 0) {
                ledBlock.push('');
            }
            pushGpioConfig(ledBlock, config.pin, config.initial);
        });
        blocks.push(ledBlock);
    }

    const bodyLines: string[] = [];
    for (const block of blocks) {
        if (bodyLines.length > 0) {
            bodyLines.push('');
        }
        bodyLines.push(...block);
    }

    const lines: string[] = [
        banner(TARGET, sourcePath),
        '',
        ...includes,
        '',
        'void board_init(void) {',
        ...bodyLines,
        '}'
    ];
    return { path: 'board_init.c', content: `${lines.join('\n')}\n` };
}

export const espidfEmitter: Emitter = {
    id: TARGET,
    displayName: 'ESP-IDF (ESP32-S3)',
    supportedMcus: SUPPORTED_MCUS,
    emit({ board, sourcePath }: EmitContext): GeneratedFile[] {
        requireMcu(board, SUPPORTED_MCUS, TARGET);
        checkReservedPins(board);
        const files = [
            emitBoardPinsH(board, sourcePath),
            emitBoardInitH(sourcePath),
            emitBoardInitC(board, sourcePath)
        ];
        if ((board.leds ?? []).length > 0) {
            files.push(emitBlinkExample(board, sourcePath));
        }
        return files;
    }
};
