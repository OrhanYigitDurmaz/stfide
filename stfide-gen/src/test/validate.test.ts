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
