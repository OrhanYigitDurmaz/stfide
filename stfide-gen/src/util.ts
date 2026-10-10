import { BoardModel, PeripheralDef, PinDef } from './model';

/**
 * Convert a pin label into an uppercase macro fragment.
 * "Debug-Tx" -> "DEBUG_TX", "3v3" -> "_3V3".
 */
export function symbolName(label: string): string {
    const cleaned = label
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (cleaned.length === 0) {
        return '_';
    }
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Macro name for a pin, e.g. PIN_DEBUG_TX. */
export function pinMacro(label: string): string {
    return `PIN_${symbolName(label)}`;
}

/**
 * Standard header banner prepended to every generated file.
 * `sourcePath` is included verbatim; callers should pass a stable relative path.
 */
export function banner(target: string, sourcePath: string): string {
    const lines = [
        'GENERATED FILE - DO NOT EDIT.',
        `Produced by stfide-gen for target "${target}".`,
        `Source: ${sourcePath}`
    ];
    const width = Math.max(...lines.map(line => line.length)) + 4;
    const rule = `// ${'-'.repeat(width)}`;
    return [rule, ...lines.map(line => `// ${line}`), rule].join('\n');
}

/** Pins sorted by physical pin number (deterministic output). */
export function sortedPins(board: BoardModel): PinDef[] {
    return [...board.pins].sort((a, b) => a.pin - b.pin);
}

/** Files sorted by path (deterministic output). */
export function filesSorted<T extends { path: string }>(files: T[]): T[] {
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

/** Escape a string for use as a C string literal (including quotes). */
export function cString(value: string): string {
    return JSON.stringify(value);
}

/** All peripherals of one kind, in declaration order. */
export function peripheralsOfKind<K extends PeripheralDef['kind']>(
    board: BoardModel,
    kind: K
): Extract<PeripheralDef, { kind: K }>[] {
    return (board.peripherals ?? []).filter(
        (peripheral): peripheral is Extract<PeripheralDef, { kind: K }> => peripheral.kind === kind
    ) as Extract<PeripheralDef, { kind: K }>[];
}

export function findPinByLabel(board: BoardModel, label: string): PinDef | undefined {
    const key = label.toUpperCase();
    return board.pins.find(pin => pin.label.toUpperCase() === key);
}

/** Resolve a pin label to its physical pin number; throws with a clear message. */
export function requirePinNumber(board: BoardModel, label: string): number {
    const pin = findPinByLabel(board, label);
    if (!pin) {
        throw new Error(`board "${board.name}": no pin with label "${label}"`);
    }
    return pin.pin;
}

/** Guard used by emitters for MCU compatibility. */
export function requireMcu(board: BoardModel, supported: readonly string[], emitterId: string): void {
    if (!supported.includes(board.mcu)) {
        throw new Error(
            `target "${emitterId}" does not support mcu "${board.mcu}" (supported: ${supported.join(', ')})`
        );
    }
}
