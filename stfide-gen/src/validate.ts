import { MCUS, Mcu } from './model';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
    level: IssueLevel;
    message: string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KNOWN_SIGNAL_PREFIXES = ['gpio_', 'uart', 'i2c', 'spi', 'pwm', 'adc', 'pio'];
const PERIPHERAL_KINDS = ['uart', 'i2c', 'spi', 'pwm', 'adc', 'pio'] as const;

/** Default crystal frequencies per MCU (warn when a board differs). */
const DEFAULT_XOSC_HZ: Partial<Record<Mcu, number>> = {
    rp2040: 12000000,
    esp32s3: 40000000
};

/** Highest "stock" system clock per MCU (warn above it). */
const MAX_STOCK_SYS_HZ: Partial<Record<Mcu, number>> = {
    rp2040: 133000000,
    esp32s3: 240000000
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Structural validation of a parsed board file.
 * Returns all findings; 'error' findings make a board unusable.
 */
export function validateBoard(input: unknown): Issue[] {
    const issues: Issue[] = [];
    const error = (message: string): void => { issues.push({ level: 'error', message }); };
    const warn = (message: string): void => { issues.push({ level: 'warning', message }); };

    if (!isRecord(input)) {
        error('board must be a JSON object');
        return issues;
    }

    if (input.version !== 1) {
        error(`unsupported board schema version ${JSON.stringify(input.version)} (expected 1)`);
    }
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        error('name must be a non-empty string');
    }
    const mcu: Mcu | undefined = MCUS.includes(input.mcu as Mcu) ? input.mcu as Mcu : undefined;
    if (mcu === undefined) {
        error(`mcu must be one of: ${MCUS.join(', ')}`);
    }

    const maxPin = mcu === 'rp2040' ? 29 : mcu === 'esp32s3' ? 48 : 127;
    const knownLabels = new Set<string>();

    const clock = input.clock;
    if (clock !== undefined) {
        if (!isRecord(clock)) {
            error('clock must be an object');
        } else {
            const { xoscHz, sysHz } = clock;
            if (xoscHz !== undefined) {
                if (!isInteger(xoscHz) || xoscHz <= 0) {
                    error('clock.xoscHz must be a positive integer');
                } else {
                    const defaultXosc = mcu !== undefined ? DEFAULT_XOSC_HZ[mcu] : undefined;
                    if (defaultXosc !== undefined && xoscHz !== defaultXosc) {
                        warn(
                            `clock.xoscHz ${xoscHz} differs from the ${mcu} default (${defaultXosc}); ` +
                            'the generated code/comments will call out the required crystal/SDK configuration'
                        );
                    }
                }
            }
            if (sysHz !== undefined) {
                if (!isInteger(sysHz) || sysHz <= 0) {
                    error('clock.sysHz must be a positive integer');
                } else {
                    const maxStock = mcu !== undefined ? MAX_STOCK_SYS_HZ[mcu] : undefined;
                    if (maxStock !== undefined && sysHz > maxStock) {
                        warn(
                            `clock.sysHz ${sysHz} exceeds the ${mcu} stock clock (${maxStock}); ` +
                            'this is an overclock / unsupported configuration'
                        );
                    }
                }
            }
        }
    }

    const pins = input.pins;
    if (!Array.isArray(pins) || pins.length === 0) {
        error('pins must be a non-empty array');
    } else {
        const seenPins = new Map<number, number>();
        const seenLabels = new Map<string, number>();
        pins.forEach((entry: unknown, index: number) => {
            const at = `pins[${index}]`;
            if (!isRecord(entry)) {
                error(`${at}: must be an object`);
                return;
            }
            const { pin, label, signal, pull, initial } = entry;

            if (!isInteger(pin)) {
                error(`${at}.pin must be an integer`);
            } else {
                if (pin < 0 || pin > maxPin) {
                    error(`${at}.pin ${pin} is out of range for ${mcu ?? 'the configured mcu'} (0..${maxPin})`);
                }
                const previous = seenPins.get(pin);
                if (previous !== undefined) {
                    error(`${at}.pin ${pin} is already used by pins[${previous}]`);
                } else {
                    seenPins.set(pin, index);
                }
            }

            if (typeof label !== 'string' || !IDENTIFIER.test(label)) {
                error(`${at}.label must be a valid identifier (letters, digits, underscore; not starting with a digit)`);
            } else {
                const key = label.toUpperCase();
                const previous = seenLabels.get(key);
                if (previous !== undefined) {
                    error(`${at}.label "${label}" duplicates pins[${previous}].label (case-insensitive)`);
                } else {
                    seenLabels.set(key, index);
                    knownLabels.add(key);
                }
            }

            if (typeof signal !== 'string' || signal.length === 0) {
                error(`${at}.signal must be a non-empty string`);
            } else if (!KNOWN_SIGNAL_PREFIXES.some(prefix => signal.startsWith(prefix))) {
                warn(`${at}.signal "${signal}" is not a recognized signal family; emitters may ignore it`);
            }

            if (pull !== undefined && pull !== 'up' && pull !== 'down' && pull !== 'none') {
                error(`${at}.pull must be "up", "down" or "none"`);
            }
            if (initial !== undefined && initial !== 'high' && initial !== 'low' && initial !== 'input') {
                error(`${at}.initial must be "high", "low" or "input"`);
            }
            if (typeof signal === 'string') {
                const isGpioSignal = signal.startsWith('gpio');
                const isI2cSignal = signal.startsWith('i2c');
                if (pull !== undefined && !isGpioSignal && !isI2cSignal) {
                    warn(`${at}.pull is only used by gpio_* and i2c* signals`);
                }
                if (initial !== undefined && !isGpioSignal) {
                    warn(`${at}.initial is only used by gpio_* signals`);
                }
            }
        });
    }

    const peripherals = input.peripherals;
    if (peripherals !== undefined) {
        if (!Array.isArray(peripherals)) {
            error('peripherals must be an array');
        } else {
            const ids = new Map<string, number>();
            const labelRefs = new Map<string, string>();

            const requireLabelRef = (at: string, field: string, value: unknown, required: boolean, owner: string): void => {
                if (value === undefined) {
                    if (required) {
                        error(`${at}.${field} is required`);
                    }
                    return;
                }
                if (typeof value !== 'string' || value.length === 0) {
                    error(`${at}.${field} must be a pin label string`);
                    return;
                }
                const key = value.toUpperCase();
                if (!knownLabels.has(key)) {
                    error(`${at}.${field}: "${value}" does not match any pin label`);
                    return;
                }
                const previous = labelRefs.get(key);
                if (previous !== undefined && previous !== owner) {
                    error(`${at}.${field}: pin "${value}" is already referenced by ${previous}`);
                } else {
                    labelRefs.set(key, owner);
                }
            };

            const requireFrequency = (at: string, value: unknown): void => {
                if (value !== undefined && (typeof value !== 'number' || !(value > 0))) {
                    error(`${at} must be a positive number`);
                }
            };

            peripherals.forEach((entry: unknown, index: number) => {
                const at = `peripherals[${index}]`;
                if (!isRecord(entry)) {
                    error(`${at}: must be an object`);
                    return;
                }
                const kind = entry.kind;
                if (typeof kind !== 'string' || !(PERIPHERAL_KINDS as readonly string[]).includes(kind)) {
                    error(`${at}.kind must be one of: ${PERIPHERAL_KINDS.join(', ')}`);
                    return;
                }
                const id = entry.id;
                if (typeof id !== 'string' || id.length === 0) {
                    error(`${at}.id must be a non-empty string`);
                } else {
                    const previous = ids.get(id);
                    if (previous !== undefined) {
                        error(`${at}.id "${id}" duplicates peripherals[${previous}].id`);
                    } else {
                        ids.set(id, index);
                    }
                }
                const owner = `${kind} "${String(id)}"`;

                switch (kind) {
                    case 'uart':
                        if (typeof entry.baud !== 'number' || !(entry.baud > 0)) {
                            error(`${at}.baud must be a positive number`);
                        }
                        requireLabelRef(at, 'tx', entry.tx, true, owner);
                        requireLabelRef(at, 'rx', entry.rx, true, owner);
                        break;
                    case 'i2c':
                        requireLabelRef(at, 'sda', entry.sda, true, owner);
                        requireLabelRef(at, 'scl', entry.scl, true, owner);
                        requireFrequency(`${at}.freqHz`, entry.freqHz);
                        break;
                    case 'spi':
                        requireLabelRef(at, 'sck', entry.sck, true, owner);
                        requireLabelRef(at, 'mosi', entry.mosi, false, owner);
                        requireLabelRef(at, 'miso', entry.miso, false, owner);
                        requireFrequency(`${at}.freqHz`, entry.freqHz);
                        break;
                    case 'pwm':
                    case 'adc':
                        requireLabelRef(at, 'pin', entry.pin, true, owner);
                        if (kind === 'pwm') {
                            requireFrequency(`${at}.freqHz`, entry.freqHz);
                        }
                        break;
                    case 'pio': {
                        if (mcu !== undefined && mcu !== 'rp2040') {
                            error(`${at}: pio peripherals require mcu "rp2040" (board mcu is "${mcu}")`);
                        }
                        if (typeof id === 'string' && id !== 'pio0' && id !== 'pio1') {
                            error(`${at}.id must be "pio0" or "pio1"`);
                        }
                        const sm = entry.sm;
                        if (!isInteger(sm) || sm < 0 || sm > 3) {
                            error(`${at}.sm must be an integer in 0..3`);
                        }
                        requireLabelRef(at, 'pin', entry.pin, true, owner);
                        const program = entry.program;
                        if (program !== undefined && (typeof program !== 'string' || program.length === 0)) {
                            error(`${at}.program must be a non-empty string`);
                        }
                        requireFrequency(`${at}.freqHz`, entry.freqHz);
                        break;
                    }
                }
            });
        }
    }

    const leds = input.leds;
    if (leds !== undefined) {
        if (!Array.isArray(leds)) {
            error('leds must be an array');
        } else {
            const names = new Map<string, number>();
            leds.forEach((entry: unknown, index: number) => {
                const at = `leds[${index}]`;
                if (!isRecord(entry)) {
                    error(`${at}: must be an object`);
                    return;
                }
                const { name, label, activeLow } = entry;
                if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
                    error(`${at}.name must be a valid identifier`);
                } else {
                    const previous = names.get(name);
                    if (previous !== undefined) {
                        error(`${at}.name "${name}" duplicates leds[${previous}].name`);
                    } else {
                        names.set(name, index);
                    }
                }
                if (typeof label !== 'string' || !knownLabels.has(label.toUpperCase())) {
                    error(`${at}.label: "${String(label)}" does not match any pin label`);
                }
                if (activeLow !== undefined && typeof activeLow !== 'boolean') {
                    error(`${at}.activeLow must be a boolean`);
                }
            });
        }
    }

    return issues;
}
