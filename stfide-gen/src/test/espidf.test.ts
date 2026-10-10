import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { loadBoard } from '../load';
import { mergeUserCode } from '../merge';
import { espidfEmitter } from '../emitters/espidf';
import { BoardModel } from '../model';

/** Real board shipped in the repository (has leds, uart0, i2c0, spi2, pwm0, adc0). */
const REAL_BOARD = path.join(__dirname, '..', '..', '..', 'boards', 'oc1-esp32s3.board.json');

function emit(board: BoardModel, sourcePath = 'test.board.json') {
    return espidfEmitter.emit({ board, sourcePath });
}

test('real oc1-esp32s3 board: expected paths, determinism and key statements', () => {
    const loaded = loadBoard(REAL_BOARD);
    const first = espidfEmitter.emit({ board: loaded.board, sourcePath: loaded.sourcePath });
    const second = espidfEmitter.emit({ board: loaded.board, sourcePath: loaded.sourcePath });

    // Deterministic: identical context -> byte-identical output.
    assert.deepStrictEqual(second, first);

    // Expected files: the three core files plus the standard blink example.
    assert.deepStrictEqual(
        first.map(file => file.path),
        ['board_pins.h', 'board_init.h', 'board_init.c', 'example/blink/blink.c']
    );

    const pinsH = first.find(file => file.path === 'board_pins.h')!.content;
    const initH = first.find(file => file.path === 'board_init.h')!.content;
    const initC = first.find(file => file.path === 'board_init.c')!.content;
    const blink = first.find(file => file.path === 'example/blink/blink.c')!.content;

    assert.match(pinsH, /#pragma once/);
    assert.match(pinsH, /#define PIN_STATUS_LED 48\n/);
    assert.match(pinsH, /#define LED_BUILTIN PIN_STATUS_LED\n/);
    assert.match(pinsH, /#define LED_BUILTIN_ACTIVE_LOW 0\n/);
    assert.match(initH, /void board_init\(void\);/);

    assert.ok(blink.includes('// Add this file plus board_init.c / board_init.h / board_pins.h to your'));
    assert.ok(blink.includes('// ESP-IDF project (e.g. as a component); app_main() is the application entry point.'));
    assert.ok(blink.includes('#include "freertos/FreeRTOS.h"'));
    assert.ok(blink.includes('#include "freertos/task.h"'));
    assert.ok(blink.includes('#include "driver/gpio.h"'));
    assert.ok(blink.includes('#include "board_init.h"'));
    assert.ok(blink.includes('#include "board_pins.h"'));
    assert.ok(blink.includes('void app_main(void) {'));
    assert.ok(blink.includes('    board_init();'));
    assert.ok(blink.includes('gpio_set_level(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? 0 : 1);   // on'));
    assert.ok(blink.includes('gpio_set_level(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? 1 : 0);   // off'));
    assert.ok(blink.includes('vTaskDelay(pdMS_TO_TICKS(250));'));

    assert.ok(initC.includes('ESP_ERROR_CHECK(gpio_set_level(PIN_STATUS_LED, 0))'));
    assert.ok(initC.includes('ESP_ERROR_CHECK(gpio_set_level(PIN_SPI_CS, 1))'));
    assert.ok(initC.includes('ESP_ERROR_CHECK(gpio_set_pull_mode(PIN_I2C_SDA, GPIO_PULLUP_ONLY));'));
    assert.ok(initC.includes('uart_set_pin(UART_NUM_0, PIN_DEBUG_TX, PIN_DEBUG_RX, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE)'));
    assert.ok(initC.includes('i2c_param_config(I2C_NUM_0'));
    assert.ok(initC.includes('.master.clk_speed = 400000'));
    assert.ok(initC.includes('spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO)'));
    assert.ok(initC.includes('// System clock: set CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ via sdkconfig (target 240 MHz)'));
    assert.ok(initC.includes('// Crystal: 40 MHz -> set CONFIG_XTAL_FREQ_40 in sdkconfig'));
    assert.ok(initC.includes('// PWM on PIN_BUZZER (pwm0): use the LEDC driver (ledc_timer_config/ledc_channel_config)'));
    assert.ok(initC.includes('// ADC on PIN_AIN0 (adc0): use the One-Shot ADC driver (adc_oneshot_new_unit)'));
    assert.ok(initC.includes('/* USER CODE BEGIN includes */'));
    assert.ok(initC.includes('    /* USER CODE BEGIN board_init */'));
});

const SMALL_BOARD: BoardModel = {
    version: 1,
    name: 'small-board',
    mcu: 'esp32s3',
    pins: [
        { pin: 2, label: 'LED', signal: 'gpio_out', initial: 'low' },
        { pin: 4, label: 'TX', signal: 'uart1_tx' },
        { pin: 5, label: 'RX', signal: 'uart1_rx' }
    ],
    peripherals: [{ kind: 'uart', id: 'uart1', baud: 9600, tx: 'TX', rx: 'RX' }],
    leds: [{ name: 'LED_BUILTIN', label: 'LED' }]
};

test('small fixture: board_init.c and blink example golden files', () => {
    const files = emit(SMALL_BOARD, 'small.board.json');
    assert.deepStrictEqual(
        files.map(file => file.path),
        ['board_pins.h', 'board_init.h', 'board_init.c', 'example/blink/blink.c']
    );
    const pinsH = files.find(file => file.path === 'board_pins.h')!.content;
    const initC = files.find(file => file.path === 'board_init.c')!.content;
    const blink = files.find(file => file.path === 'example/blink/blink.c')!.content;
    assert.match(pinsH, /#define LED_BUILTIN PIN_LED\n#define LED_BUILTIN_ACTIVE_LOW 0\n/);

    const rule = '// ' + '-'.repeat(47);
    const expected = [
        rule,
        '// GENERATED FILE - DO NOT EDIT.',
        '// Produced by stfide-gen for target "espidf".',
        '// Source: small.board.json',
        rule,
        '',
        '#include "board_init.h"',
        '#include "board_pins.h"',
        '',
        '#include "driver/gpio.h"',
        '#include "driver/uart.h"',
        '#include "esp_err.h"',
        '',
        '/* USER CODE BEGIN includes */',
        '/* USER CODE END includes */',
        '',
        'void board_init(void) {',
        '    // ESP32-S3 routes peripheral signals to pins via the GPIO matrix; any pin can take any signal.',
        '',
        '    gpio_config_t io_conf = {};',
        '    io_conf.pin_bit_mask = 1ULL << PIN_LED;',
        '    io_conf.mode = GPIO_MODE_OUTPUT | GPIO_MODE_INPUT;',
        '    io_conf.pull_up_en = GPIO_PULLUP_DISABLE;',
        '    io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;',
        '    io_conf.intr_type = GPIO_INTR_DISABLE;',
        '    ESP_ERROR_CHECK(gpio_config(&io_conf));',
        '    ESP_ERROR_CHECK(gpio_set_level(PIN_LED, 0));',
        '',
        '    uart_config_t uart1_config = {',
        '        .baud_rate = 9600,',
        '        .data_bits = UART_DATA_8_BITS,',
        '        .parity = UART_PARITY_DISABLE,',
        '        .stop_bits = UART_STOP_BITS_1,',
        '        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,',
        '        .source_clk = UART_SCLK_DEFAULT',
        '    };',
        '    ESP_ERROR_CHECK(uart_param_config(UART_NUM_1, &uart1_config));',
        '    ESP_ERROR_CHECK(uart_set_pin(UART_NUM_1, PIN_TX, PIN_RX, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));',
        '    ESP_ERROR_CHECK(uart_driver_install(UART_NUM_1, 256, 256, 0, NULL, 0));',
        '',
        '    /* USER CODE BEGIN board_init */',
        '    /* USER CODE END board_init */',
        '}',
        ''
    ].join('\n');

    assert.strictEqual(initC, expected);

    const expectedBlink = [
        rule,
        '// GENERATED FILE - DO NOT EDIT.',
        '// Produced by stfide-gen for target "espidf".',
        '// Source: small.board.json',
        rule,
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
        '        gpio_set_level(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? 0 : 1);   // on',
        '        vTaskDelay(pdMS_TO_TICKS(250));',
        '        gpio_set_level(LED_BUILTIN, LED_BUILTIN_ACTIVE_LOW ? 1 : 0);   // off',
        '        vTaskDelay(pdMS_TO_TICKS(250));',
        '    }',
        '}',
        ''
    ].join('\n');

    assert.strictEqual(blink, expectedBlink);
});

test('led on a non-gpio_out pin gets its own gpio configuration', () => {
    const board: BoardModel = {
        version: 1,
        name: 'led-on-uart',
        mcu: 'esp32s3',
        pins: [
            { pin: 6, label: 'UX', signal: 'uart0_tx' },
            { pin: 7, label: 'URX', signal: 'uart0_rx' },
            { pin: 8, label: 'MYLED', signal: 'pwm0_a', initial: 'high' }
        ],
        peripherals: [
            { kind: 'uart', id: 'uart0', baud: 115200, tx: 'UX', rx: 'URX' },
            { kind: 'pwm', id: 'pwm0', pin: 'MYLED' }
        ],
        leds: [{ name: 'LED2', label: 'MYLED', activeLow: true }]
    };
    const files = emit(board);
    const pinsH = files.find(file => file.path === 'board_pins.h')!.content;
    const initC = files.find(file => file.path === 'board_init.c')!.content;
    const blink = files.find(file => file.path === 'example/blink/blink.c')!.content;

    assert.deepStrictEqual(
        files.map(file => file.path),
        ['board_pins.h', 'board_init.h', 'board_init.c', 'example/blink/blink.c']
    );
    assert.match(pinsH, /#define LED2 PIN_MYLED\n#define LED2_ACTIVE_LOW 1\n/);
    assert.ok(initC.includes('io_conf.pin_bit_mask = 1ULL << PIN_MYLED;'));
    assert.ok(initC.includes('ESP_ERROR_CHECK(gpio_set_level(PIN_MYLED, 1));'));
    assert.ok(initC.includes('// PWM on PIN_MYLED (pwm0): use the LEDC driver'));
    assert.ok(blink.includes('gpio_set_level(LED2, LED2_ACTIVE_LOW ? 0 : 1);   // on'));
    assert.ok(blink.includes('gpio_set_level(LED2, LED2_ACTIVE_LOW ? 1 : 0);   // off'));
});

test('board without leds: still emits the three files, no blink example', () => {
    const board: BoardModel = {
        version: 1,
        name: 'no-led',
        mcu: 'esp32s3',
        pins: [{ pin: 2, label: 'BTN', signal: 'gpio_in', pull: 'up' }]
    };
    const files = emit(board);
    const paths = files.map(file => file.path);

    assert.deepStrictEqual(paths, ['board_pins.h', 'board_init.h', 'board_init.c']);
    assert.ok(!paths.some(p => p.includes('blink') || p.includes('example')));
    const pinsH = files.find(file => file.path === 'board_pins.h')!.content;
    assert.ok(!pinsH.includes('LED'));
});

test('reserved flash pin 26 throws', () => {
    const board: BoardModel = {
        version: 1,
        name: 'flash-clash',
        mcu: 'esp32s3',
        pins: [{ pin: 26, label: 'BAD', signal: 'gpio_out' }]
    };
    assert.throws(() => emit(board), /pin 26 .*reserved for the SPI flash/);
});

test('unsupported uart id throws', () => {
    const board: BoardModel = {
        version: 1,
        name: 'bad-uart',
        mcu: 'esp32s3',
        pins: [
            { pin: 4, label: 'TX', signal: 'uart7_tx' },
            { pin: 5, label: 'RX', signal: 'uart7_rx' }
        ],
        peripherals: [{ kind: 'uart', id: 'uart7', baud: 9600, tx: 'TX', rx: 'RX' }]
    };
    assert.throws(() => emit(board), /uart7/);
});

test('unsupported spi id throws (only spi2/spi3)', () => {
    const board: BoardModel = {
        version: 1,
        name: 'bad-spi',
        mcu: 'esp32s3',
        pins: [{ pin: 4, label: 'SCK', signal: 'spi0_sck' }],
        peripherals: [{ kind: 'spi', id: 'spi0', sck: 'SCK' }]
    };
    assert.throws(() => emit(board), /spi0/);
});

test('rp2040 board throws (unsupported mcu)', () => {
    const board: BoardModel = {
        version: 1,
        name: 'rp2040-board',
        mcu: 'rp2040',
        pins: [{ pin: 0, label: 'X', signal: 'gpio_out' }]
    };
    assert.throws(() => emit(board), /does not support mcu "rp2040"/);
});

test('crystal comment: integer MHz uses CONFIG_XTAL_FREQ_<MHz>, otherwise a generic Hz form', () => {
    const integer = emit({ ...SMALL_BOARD, clock: { xoscHz: 40000000, sysHz: 240000000 } });
    const integerInit = integer.find(file => file.path === 'board_init.c')!.content;
    assert.ok(integerInit.includes('    // Crystal: 40 MHz -> set CONFIG_XTAL_FREQ_40 in sdkconfig'));
    assert.ok(
        integerInit.includes(
            '    // System clock: set CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ via sdkconfig (target 240 MHz)'
        )
    );

    const fractional = emit({ ...SMALL_BOARD, clock: { xoscHz: 12345678 } });
    const fractionalInit = fractional.find(file => file.path === 'board_init.c')!.content;
    assert.ok(
        fractionalInit.includes(
            '    // Crystal: 12345678 Hz -> set the matching CONFIG_XTAL_FREQ_* value in sdkconfig'
        )
    );
    assert.ok(!fractionalInit.includes('CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ'));
});

test('regeneration merge keeps user code in board_init.c', () => {
    const first = emit(SMALL_BOARD, 'small.board.json').find(file => file.path === 'board_init.c')!.content;
    const edited = first
        .replace(
            '/* USER CODE BEGIN includes */\n/* USER CODE END includes */',
            '/* USER CODE BEGIN includes */\n#include "my_extra.h"\n/* USER CODE END includes */'
        )
        .replace(
            '    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */',
            '    /* USER CODE BEGIN board_init */\n    app_clock_setup();\n    /* USER CODE END board_init */'
        );
    const regenerated = mergeUserCode(first, edited);
    assert.ok(regenerated.includes('#include "my_extra.h"'));
    assert.ok(regenerated.includes('    app_clock_setup();'));
    assert.ok(regenerated.includes('ESP_ERROR_CHECK(uart_set_pin(UART_NUM_1'));
});
