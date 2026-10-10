import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateBoard } from '../validate';

/** Minimal valid board used as the baseline for negative tests. */
function baseBoard(): Record<string, unknown> {
    return {
        version: 1,
        name: 'test-board',
        mcu: 'rp2040',
        pins: [
            { pin: 0, label: 'TX', signal: 'uart0_tx' },
            { pin: 1, label: 'RX', signal: 'uart0_rx' },
            { pin: 4, label: 'SDA', signal: 'i2c0_sda', pull: 'up' },
            { pin: 5, label: 'SCL', signal: 'i2c0_scl', pull: 'up' },
            { pin: 25, label: 'LED', signal: 'gpio_out', initial: 'low' }
        ],
        peripherals: [
            { kind: 'uart', id: 'uart0', baud: 115200, tx: 'TX', rx: 'RX' },
            { kind: 'i2c', id: 'i2c0', sda: 'SDA', scl: 'SCL', freqHz: 400000 }
        ],
        leds: [{ name: 'LED_BUILTIN', label: 'LED', activeLow: false }]
    };
}

function errors(input: unknown): string[] {
    return validateBoard(input).filter(issue => issue.level === 'error').map(issue => issue.message);
}

function warnings(input: unknown): string[] {
    return validateBoard(input).filter(issue => issue.level === 'warning').map(issue => issue.message);
}

test('valid board produces no findings', () => {
    assert.deepStrictEqual(validateBoard(baseBoard()), []);
});

test('i2c pull-ups are accepted without warnings', () => {
    assert.deepStrictEqual(warnings(baseBoard()), []);
});

test('duplicate pin numbers are rejected', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 0, label: 'OTHER', signal: 'gpio_out' });
    assert.ok(errors(board).some(message => message.includes('already used')));
});

test('duplicate labels are rejected case-insensitively', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 9, label: 'tx', signal: 'gpio_out' });
    assert.ok(errors(board).some(message => message.includes('duplicates')));
});

test('pins outside the mcu range are rejected', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 30, label: 'TOO_HIGH', signal: 'gpio_out' });
    assert.ok(errors(board).some(message => message.includes('out of range for rp2040')));
});

test('peripherals referencing unknown labels are rejected', () => {
    const board = baseBoard();
    (board.peripherals as unknown[]).push({ kind: 'adc', id: 'adc0', pin: 'NOPE' });
    assert.ok(errors(board).some(message => message.includes('does not match any pin label')));
});

test('initial on a non-gpio signal warns', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 2, label: 'TX2', signal: 'uart0_cts', initial: 'low' });
    assert.ok(warnings(board).some(message => message.includes('.initial is only used by gpio_*')));
});

test('pull on a non-gpio, non-i2c signal warns', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 2, label: 'TX2', signal: 'uart0_cts', pull: 'up' });
    assert.ok(warnings(board).some(message => message.includes('.pull is only used by gpio_* and i2c*')));
});

test('unknown signal families warn but do not fail validation', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 8, label: 'MYSTERY', signal: 'mystery_bus' });
    assert.ok(warnings(board).some(message => message.includes('not a recognized signal family')));
    assert.deepStrictEqual(errors(board), []);
});

test('invalid peripheral kind is rejected', () => {
    const board = baseBoard();
    (board.peripherals as unknown[]).push({ kind: 'can', id: 'can0', pin: 'TX' });
    assert.ok(errors(board).some(message => message.includes('.kind must be one of')));
});

// ---------------------------------------------------------------------------
// PIO
// ---------------------------------------------------------------------------

/** baseBoard plus a pio pin/peripheral; val pio peripheral fields can be overridden. */
function pioBoard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 2, label: 'LED_STRIP', signal: 'pio0' });
    (board.peripherals as unknown[]).push({
        kind: 'pio',
        id: 'pio0',
        sm: 0,
        pin: 'LED_STRIP',
        program: 'ws2812',
        freqHz: 800000,
        ...overrides
    });
    return board;
}

test('pio peripheral and pio signals are accepted on rp2040', () => {
    assert.deepStrictEqual(validateBoard(pioBoard()), []);
});

test('pio signals do not warn as unknown signal families', () => {
    const board = baseBoard();
    (board.pins as unknown[]).push({ pin: 2, label: 'STRIP', signal: 'pio1' });
    assert.deepStrictEqual(warnings(board), []);
});

test('pio peripherals are rejected on non-rp2040 boards', () => {
    const board = pioBoard();
    board.mcu = 'esp32s3';
    assert.ok(errors(board).some(message => message.includes('pio peripherals require mcu "rp2040"')));
});

test('pio id must be pio0 or pio1', () => {
    assert.ok(errors(pioBoard({ id: 'pio2' })).some(message => message.includes('must be "pio0" or "pio1"')));
    assert.deepStrictEqual(errors(pioBoard({ id: 'pio1' })), []);
});

test('pio sm must be an integer in 0..3', () => {
    for (const sm of [-1, 4, 1.5, '0']) {
        assert.ok(
            errors(pioBoard({ sm })).some(message => message.includes('.sm must be an integer in 0..3')),
            `expected sm ${JSON.stringify(sm)} to be rejected`
        );
    }
    for (const sm of [0, 3]) {
        assert.deepStrictEqual(errors(pioBoard({ sm })), []);
    }
});

test('pio pin must reference an existing pin label', () => {
    assert.ok(errors(pioBoard({ pin: 'NOPE' })).some(message => message.includes('does not match any pin label')));
});

test('pio program must be a non-empty string when present', () => {
    assert.ok(errors(pioBoard({ program: '' })).some(message => message.includes('.program must be a non-empty string')));
    assert.deepStrictEqual(errors(pioBoard({ program: undefined })), []);
});

test('pio freqHz must be a positive number when present', () => {
    assert.ok(errors(pioBoard({ freqHz: 0 })).some(message => message.includes('must be a positive number')));
    assert.deepStrictEqual(errors(pioBoard({ freqHz: undefined })), []);
});

// ---------------------------------------------------------------------------
// Clock tree
// ---------------------------------------------------------------------------

test('clock.xoscHz differing from the mcu default warns with actionable wording', () => {
    const board = baseBoard();
    board.clock = { xoscHz: 16000000 };
    const findings = warnings(board);
    assert.ok(
        findings.some(
            message =>
                message.includes('clock.xoscHz 16000000') &&
                message.includes('12000000') &&
                message.includes('generated code')
        ),
        findings.join('\n')
    );

    board.clock = { xoscHz: 12000000 }; // rp2040 default: no warning
    assert.deepStrictEqual(warnings(board), []);

    board.mcu = 'esp32s3';
    board.clock = { xoscHz: 40000000 }; // esp32s3 default: no warning
    assert.deepStrictEqual(warnings(board), []);

    board.clock = { xoscHz: 12000000 }; // differs for esp32s3
    assert.ok(warnings(board).some(message => message.includes('40000000')));
});

test('clock.xoscHz must be a positive integer', () => {
    const board = baseBoard();
    board.clock = { xoscHz: 0 };
    assert.ok(errors(board).some(message => message.includes('clock.xoscHz must be a positive integer')));
    board.clock = { xoscHz: 12000000.5 };
    assert.ok(errors(board).some(message => message.includes('clock.xoscHz must be a positive integer')));
});

test('clock.sysHz above the stock clock warns (overclock)', () => {
    const board = baseBoard();
    board.clock = { sysHz: 133000000 }; // rp2040 stock: no warning
    assert.deepStrictEqual(warnings(board), []);

    board.clock = { sysHz: 150000000 };
    const findings = warnings(board);
    assert.ok(
        findings.some(message => message.includes('clock.sysHz 150000000') && message.includes('overclock')),
        findings.join('\n')
    );

    board.mcu = 'esp32s3';
    board.clock = { sysHz: 240000000 }; // esp32s3 stock: no warning
    assert.deepStrictEqual(warnings(board), []);

    board.clock = { sysHz: 300000000 };
    assert.ok(warnings(board).some(message => message.includes('overclock')));
});

test('clock.sysHz must be a positive integer', () => {
    const board = baseBoard();
    board.clock = { sysHz: -1000 };
    assert.ok(errors(board).some(message => message.includes('clock.sysHz must be a positive integer')));
    board.clock = { sysHz: 133000000.5 };
    assert.ok(errors(board).some(message => message.includes('clock.sysHz must be a positive integer')));
});

test('clock must be an object when present', () => {
    const board = baseBoard();
    board.clock = 42;
    assert.ok(errors(board).some(message => message.includes('clock must be an object')));
});
