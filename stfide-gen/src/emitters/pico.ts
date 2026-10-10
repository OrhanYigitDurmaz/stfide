import { BoardModel, LedDef, PeripheralDef, PinDef } from '../model';
import {
    banner,
    findPinByLabel,
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
 * Raspberry Pi Pico SDK emitter (RP2040).
 *
 * Generates board_pins.h, board_init.h, board_init.c and, when the board
 * declares at least one LED, example/blink/blink.c.
 */

const EMITTER_ID = 'pico';
const SUPPORTED_MCUS = ['rp2040'] as const;

/**
 * Allowed signal tokens per RP2040 GPIO number (0..29), transcribed from the
 * RP2040 datasheet (RP-008370-DS), Table 3 "GPIO bank 0" (section 2.19.2,
 * "GPIO function table"). Every pin additionally supports gpio_out / gpio_in
 * through the SIO block; those two tokens are accepted everywhere and are not
 * repeated below.
 */
const RP2040_GPIO_FUNCTIONS: readonly (readonly string[])[] = [
    ['spi0_rx', 'uart0_tx', 'i2c0_sda', 'pwm0_a'], // GPIO0
    ['spi0_csn', 'uart0_rx', 'i2c0_scl', 'pwm0_b'], // GPIO1
    ['spi0_sck', 'uart0_cts', 'i2c1_sda', 'pwm1_a'], // GPIO2
    ['spi0_tx', 'uart0_rts', 'i2c1_scl', 'pwm1_b'], // GPIO3
    ['spi0_rx', 'uart1_tx', 'i2c0_sda', 'pwm2_a'], // GPIO4
    ['spi0_csn', 'uart1_rx', 'i2c0_scl', 'pwm2_b'], // GPIO5
    ['spi0_sck', 'uart1_cts', 'i2c1_sda', 'pwm3_a'], // GPIO6
    ['spi0_tx', 'uart1_rts', 'i2c1_scl', 'pwm3_b'], // GPIO7
    ['spi1_rx', 'uart1_tx', 'i2c0_sda', 'pwm4_a'], // GPIO8
    ['spi1_csn', 'uart1_rx', 'i2c0_scl', 'pwm4_b'], // GPIO9
    ['spi1_sck', 'uart1_cts', 'i2c1_sda', 'pwm5_a'], // GPIO10
    ['spi1_tx', 'uart1_rts', 'i2c1_scl', 'pwm5_b'], // GPIO11
    ['spi1_rx', 'uart0_tx', 'i2c0_sda', 'pwm6_a'], // GPIO12
    ['spi1_csn', 'uart0_rx', 'i2c0_scl', 'pwm6_b'], // GPIO13
    ['spi1_sck', 'uart0_cts', 'i2c1_sda', 'pwm7_a'], // GPIO14
    ['spi1_tx', 'uart0_rts', 'i2c1_scl', 'pwm7_b'], // GPIO15
    ['spi0_rx', 'uart0_tx', 'i2c0_sda', 'pwm0_a'], // GPIO16
    ['spi0_csn', 'uart0_rx', 'i2c0_scl', 'pwm0_b'], // GPIO17
    ['spi0_sck', 'uart0_cts', 'i2c1_sda', 'pwm1_a'], // GPIO18
    ['spi0_tx', 'uart0_rts', 'i2c1_scl', 'pwm1_b'], // GPIO19
    ['spi0_rx', 'uart1_tx', 'i2c0_sda', 'pwm2_a'], // GPIO20
    ['spi0_csn', 'uart1_rx', 'i2c0_scl', 'pwm2_b'], // GPIO21
    ['spi0_sck', 'uart1_cts', 'i2c1_sda', 'pwm3_a'], // GPIO22
    ['spi0_tx', 'uart1_rts', 'i2c1_scl', 'pwm3_b'], // GPIO23
    ['spi1_rx', 'uart1_tx', 'i2c0_sda', 'pwm4_a'], // GPIO24
    ['spi1_csn', 'uart1_rx', 'i2c0_scl', 'pwm4_b'], // GPIO25
    ['spi1_sck', 'uart1_cts', 'i2c1_sda', 'pwm5_a', 'adc0'], // GPIO26
    ['spi1_tx', 'uart1_rts', 'i2c1_scl', 'pwm5_b', 'adc1'], // GPIO27
    ['spi1_rx', 'uart0_tx', 'i2c0_sda', 'pwm6_a', 'adc2'], // GPIO28
    ['spi1_csn', 'uart0_rx', 'i2c0_scl', 'pwm6_b', 'adc3'] // GPIO29
];

/** Validate one pin: RP2040 range plus the GPIO function table. */
function validatePin(board: BoardModel, pin: PinDef): void {
    if (!Number.isInteger(pin.pin) || pin.pin < 0 || pin.pin > 29) {
        throw new Error(
            `board "${board.name}": pin ${pin.pin} (label "${pin.label}") is out of range for RP2040 (GPIO 0..29)`
        );
    }
    if (pin.signal === 'gpio_out' || pin.signal === 'gpio_in') {
        return;
    }
    // PIO state machines can hijack any GPIO through the function mux.
    if (pin.signal === 'pio0' || pin.signal === 'pio1') {
        return;
    }
    const allowed = RP2040_GPIO_FUNCTIONS[pin.pin];
    if (!allowed.includes(pin.signal)) {
        const tokens = [...allowed, 'gpio_out', 'gpio_in'].join(', ');
        throw new Error(
            `board "${board.name}": pin ${pin.pin} (label "${pin.label}") cannot use signal ` +
            `"${pin.signal}" on RP2040; allowed signals: ${tokens}`
        );
    }
}

/** Pull statement for a pin, or undefined when no pull is configured. */
function pullStatement(pin: PinDef): string | undefined {
    if (pin.pull === 'up') {
        return `gpio_pull_up(${pinMacro(pin.label)});`;
    }
    if (pin.pull === 'down') {
        return `gpio_pull_down(${pinMacro(pin.label)});`;
    }
    return undefined;
}

/** C statements that configure one pin (after its gpio_init call). */
function pinConfigLines(pin: PinDef): string[] {
    const macro = pinMacro(pin.label);
    const pull = pullStatement(pin);

    if (pin.signal === 'gpio_out') {
        const lines = [`gpio_set_dir(${macro}, GPIO_OUT);`];
        if (pull !== undefined) {
            lines.push(pull);
        }
        if (pin.initial === 'high') {
            lines.push(`gpio_put(${macro}, 1);`);
        } else if (pin.initial === 'low') {
            lines.push(`gpio_put(${macro}, 0);`);
        }
        return lines;
    }

    if (pin.signal === 'gpio_in') {
        const lines = [`gpio_set_dir(${macro}, GPIO_IN);`];
        if (pull !== undefined) {
            lines.push(pull);
        }
        return lines;
    }

    if (pin.signal.startsWith('adc')) {
        // ADC pins are enabled through adc_gpio_init(); no FUNCSEL needed.
        return [`adc_gpio_init(${macro});`];
    }

    let family: string;
    if (pin.signal.startsWith('uart')) {
        family = 'UART';
    } else if (pin.signal.startsWith('i2c')) {
        family = 'I2C';
    } else if (pin.signal.startsWith('spi')) {
        family = 'SPI';
    } else if (pin.signal === 'pio0' || pin.signal === 'pio1') {
        // Exact token: GPIO_FUNC_PIO0 / GPIO_FUNC_PIO1.
        family = pin.signal.toUpperCase();
    } else if (pin.signal.startsWith('pwm')) {
        family = 'PWM';
    } else {
        // validatePin() already rejected unknown tokens.
        throw new Error(`internal error: unhandled signal "${pin.signal}" on pin ${pin.pin}`);
    }
    // The concrete instance (uart0/uart1, i2c0/i2c1, ...) is selected by the
    // peripheral init calls; the GPIO function is the generic family function.
    const lines = [`gpio_set_function(${macro}, GPIO_FUNC_${family});`];
    if (pull !== undefined) {
        lines.push(pull);
    }
    return lines;
}

function unsupportedId(board: BoardModel, kind: string, id: string, expected: string): Error {
    return new Error(
        `board "${board.name}": ${kind} peripheral id "${id}" is not supported by the pico target ` +
        `(expected ${expected})`
    );
}

/**
 * Fixed order of the peripheral init section: uart, i2c, spi, PIO, pwm
 * comment, adc. Declaration order only matters within one kind.
 */
const PERIPHERAL_ORDER: readonly PeripheralDef['kind'][] = ['uart', 'i2c', 'spi', 'pio', 'pwm', 'adc'];

/** Peripheral initialization statements, grouped by kind in a fixed order. */
function peripheralLines(board: BoardModel): string[] {
    const lines: string[] = [];
    for (const kind of PERIPHERAL_ORDER) {
        for (const peripheral of peripheralsOfKind(board, kind)) {
            switch (peripheral.kind) {
                case 'uart':
                    if (peripheral.id !== 'uart0' && peripheral.id !== 'uart1') {
                        throw unsupportedId(board, 'uart', peripheral.id, 'uart0 or uart1');
                    }
                    lines.push(`uart_init(${peripheral.id}, ${peripheral.baud});`);
                    break;
                case 'i2c':
                    if (peripheral.id !== 'i2c0' && peripheral.id !== 'i2c1') {
                        throw unsupportedId(board, 'i2c', peripheral.id, 'i2c0 or i2c1');
                    }
                    lines.push(`i2c_init(${peripheral.id}, ${peripheral.freqHz ?? 100000});`);
                    break;
                case 'spi':
                    if (peripheral.id !== 'spi0' && peripheral.id !== 'spi1') {
                        throw unsupportedId(board, 'spi', peripheral.id, 'spi0 or spi1');
                    }
                    lines.push(`spi_init(${peripheral.id}, ${peripheral.freqHz ?? 1000000});`);
                    break;
                case 'pio': {
                    if (peripheral.id !== 'pio0' && peripheral.id !== 'pio1') {
                        throw unsupportedId(board, 'pio', peripheral.id, 'pio0 or pio1');
                    }
                    if (!Number.isInteger(peripheral.sm) || peripheral.sm < 0 || peripheral.sm > 3) {
                        throw new Error(
                            `board "${board.name}": pio "${peripheral.id}" state machine ${peripheral.sm} ` +
                            'is out of range (0..3)'
                        );
                    }
                    requirePinNumber(board, peripheral.pin);
                    const program = peripheral.program !== undefined ? ` (program "${peripheral.program}")` : '';
                    lines.push(
                        `// PIO: ${peripheral.id} SM${peripheral.sm} drives ${pinMacro(peripheral.pin)}${program}; ` +
                        'load/configure the program in the application (pin is already routed to PIO above)'
                    );
                    break;
                }
                case 'pwm': {
                    requirePinNumber(board, peripheral.pin);
                    const signal = findPinByLabel(board, peripheral.pin)?.signal ?? peripheral.id;
                    lines.push(
                        `// PWM slice for ${pinMacro(peripheral.pin)} (${signal}): configure with ` +
                        'pwm_set_wrap()/pwm_set_chan_level() in the application'
                    );
                    break;
                }
                case 'adc':
                    // adc_init() is emitted above when the board has any ADC usage.
                    break;
            }
        }
    }
    return lines;
}

/** board_pins.h: one PIN_ macro per pin plus PICO_DEFAULT_LED_PIN. */
function emitPinsH(board: BoardModel, sourcePath: string, pins: PinDef[]): string {
    const lines: string[] = [banner(EMITTER_ID, sourcePath), '#pragma once', ''];
    for (const pin of pins) {
        lines.push(`#define ${pinMacro(pin.label)} ${pin.pin}U`);
    }
    const leds = board.leds ?? [];
    if (leds.length > 0) {
        const led = leds[0];
        if (pins.length > 0) {
            lines.push('');
        }
        lines.push(`#define PICO_DEFAULT_LED_PIN ${pinMacro(led.label)} // on-board LED: ${led.label}`);
    }
    return lines.join('\n') + '\n';
}

/** board_init.h: the single board_init() prototype. */
function emitInitH(sourcePath: string): string {
    const lines = [
        banner(EMITTER_ID, sourcePath),
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
    return lines.join('\n') + '\n';
}

/** board_init.c: clocks, pin setup and peripheral init. */
function emitInitC(board: BoardModel, sourcePath: string, pins: PinDef[]): string {
    const uarts = peripheralsOfKind(board, 'uart');
    const i2cs = peripheralsOfKind(board, 'i2c');
    const spis = peripheralsOfKind(board, 'spi');
    const pwms = peripheralsOfKind(board, 'pwm');
    const adcs = peripheralsOfKind(board, 'adc');
    const hasAdc = adcs.length > 0 || pins.some(pin => pin.signal.startsWith('adc'));

    const lines: string[] = [banner(EMITTER_ID, sourcePath), ''];
    lines.push('#include "pico/stdlib.h"');
    lines.push('#include "board_init.h"');
    lines.push('#include "board_pins.h"');
    if (board.clock?.sysHz !== undefined) {
        lines.push('#include "hardware/clocks.h"');
    }
    lines.push('#include "hardware/gpio.h"');
    if (uarts.length > 0) {
        lines.push('#include "hardware/uart.h"');
    }
    if (i2cs.length > 0) {
        lines.push('#include "hardware/i2c.h"');
    }
    if (spis.length > 0) {
        lines.push('#include "hardware/spi.h"');
    }
    if (pwms.length > 0) {
        lines.push('#include "hardware/pwm.h"');
    }
    if (hasAdc) {
        lines.push('#include "hardware/adc.h"');
    }
    lines.push('');
    lines.push(userCodeBegin('includes'));
    lines.push(userCodeEnd('includes'));
    lines.push('', 'void board_init(void) {');

    const sections: string[][] = [];

    const clockLines: string[] = [];
    const sysHz = board.clock?.sysHz;
    if (sysHz !== undefined) {
        if (!Number.isInteger(sysHz) || sysHz <= 0 || sysHz % 1000 !== 0) {
            throw new Error(
                `board "${board.name}": clock.sysHz ${sysHz} must be a positive multiple of 1000 ` +
                '(kHz precision) for the pico target'
            );
        }
        clockLines.push(`set_sys_clock_khz(${sysHz / 1000}, true);`);
    }
    const xoscHz = board.clock?.xoscHz;
    if (xoscHz !== undefined && xoscHz !== 12000000) {
        clockLines.push(
            `// NOTE: crystal ${xoscHz} Hz differs from the pico-sdk default (12 MHz); ` +
            'a board header override is required.'
        );
    }
    if (sysHz !== undefined && sysHz > 133000000) {
        clockLines.push(`// NOTE: ${sysHz / 1000} kHz exceeds the stock 133 MHz system clock (overclock).`);
    }
    if (clockLines.length > 0) {
        sections.push(clockLines);
    }

    // All pins are initialized first; only then are alternative functions set.
    sections.push(pins.map(pin => `gpio_init(${pinMacro(pin.label)});`));
    const pinConfig: string[] = [];
    for (const pin of pins) {
        pinConfig.push(...pinConfigLines(pin));
    }
    sections.push(pinConfig);

    if (hasAdc) {
        sections.push(['adc_init();']);
    }

    sections.push(peripheralLines(board));

    const body: string[] = [];
    for (const section of sections) {
        if (section.length === 0) {
            continue;
        }
        if (body.length > 0) {
            body.push('');
        }
        body.push(...section);
    }
    for (const bodyLine of body) {
        lines.push(bodyLine === '' ? '' : `    ${bodyLine}`);
    }
    if (body.length > 0) {
        lines.push('');
    }
    lines.push(userCodeBegin('board_init', '    '));
    lines.push(userCodeEnd('board_init', '    '));
    lines.push('}');
    return lines.join('\n') + '\n';
}

/** example/blink/blink.c for boards with at least one LED. */
function emitBlinkC(sourcePath: string, led: LedDef): string {
    const lines = [
        banner(EMITTER_ID, sourcePath),
        '',
        `// Blink example for the on-board LED (pin label "${led.label}",`,
        '// exposed as PICO_DEFAULT_LED_PIN by board_pins.h).',
        '//',
        '// board_init() configures every pin, clock and peripheral of this board.',
        '// board_init.c and board_pins.h from the generated output must be added',
        '// to the build (e.g. target_sources(my_app PRIVATE board_init.c)).',
        '',
        '#include "pico/stdlib.h"',
        '#include "board_init.h"',
        '#include "board_pins.h"',
        '',
        'int main(void) {',
        '    board_init();',
        '    while (true) {',
        '        gpio_put(PICO_DEFAULT_LED_PIN, 1);',
        '        sleep_ms(250);',
        '        gpio_put(PICO_DEFAULT_LED_PIN, 0);',
        '        sleep_ms(250);',
        '    }',
        '}'
    ];
    return lines.join('\n') + '\n';
}

export const picoEmitter: Emitter = {
    id: EMITTER_ID,
    displayName: 'Raspberry Pi Pico SDK (RP2040)',
    supportedMcus: SUPPORTED_MCUS,
    emit(context: EmitContext): GeneratedFile[] {
        const { board, sourcePath } = context;
        requireMcu(board, SUPPORTED_MCUS, EMITTER_ID);
        const pins = sortedPins(board);
        for (const pin of pins) {
            validatePin(board, pin);
        }

        const files: GeneratedFile[] = [
            { path: 'board_pins.h', content: emitPinsH(board, sourcePath, pins) },
            { path: 'board_init.h', content: emitInitH(sourcePath) },
            { path: 'board_init.c', content: emitInitC(board, sourcePath, pins) }
        ];

        const leds = board.leds ?? [];
        if (leds.length > 0) {
            files.push({ path: 'example/blink/blink.c', content: emitBlinkC(sourcePath, leds[0]) });
        }
        return files;
    }
};
