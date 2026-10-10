/**
 * Board model: the source of truth for one custom card.
 * Serialized as JSON (see boards/*.board.json) and consumed by all emitters.
 */

export const MCUS = ['rp2040', 'esp32s3'] as const;
export type Mcu = typeof MCUS[number];

export type PinPull = 'up' | 'down' | 'none';
export type PinInitial = 'high' | 'low' | 'input';

/**
 * One physical pin assignment.
 */
export interface PinDef {
    /** Physical GPIO number (RP2040: 0..29, ESP32-S3: 0..48). */
    pin: number;
    /**
     * Stable human symbol for generated code, e.g. "DEBUG_TX" becomes macro
     * PIN_DEBUG_TX. Must be a valid identifier.
     */
    label: string;
    /**
     * Logical signal routed to the pin, e.g. "uart0_tx", "i2c0_sda",
     * "spi0_sck", "pwm2_b", "adc0", "gpio_out", "gpio_in".
     */
    signal: string;
    /** GPIO pull configuration (gpio_* signals only). */
    pull?: PinPull;
    /** Initial state for output/input pins (gpio_* signals only). */
    initial?: PinInitial;
}

export interface UartDef {
    kind: 'uart';
    /** Controller id: "uart0" or "uart1". */
    id: string;
    baud: number;
    /** Pin label used as TX. */
    tx: string;
    /** Pin label used as RX. */
    rx: string;
}

export interface I2cDef {
    kind: 'i2c';
    /** Controller id: "i2c0" or "i2c1". */
    id: string;
    sda: string;
    scl: string;
    /** Bus clock in Hz (default: 100000). */
    freqHz?: number;
}

export interface SpiDef {
    kind: 'spi';
    /** Controller id: "spi0"/"spi1" (RP2040) or "spi2"/"spi3" (ESP32-S3). */
    id: string;
    sck: string;
    /** MOSI pin label ("spiN_tx" signals). */
    mosi?: string;
    /** MISO pin label ("spiN_rx" signals). */
    miso?: string;
    /** Bus clock in Hz (default: 1000000). */
    freqHz?: number;
}

export interface PwmDef {
    kind: 'pwm';
    id: string;
    pin: string;
    freqHz?: number;
}

export interface AdcDef {
    kind: 'adc';
    id: string;
    pin: string;
}

export interface PioDef {
    kind: 'pio';
    /** Controller id: "pio0" or "pio1" (RP2040 only). */
    id: string;
    /** State machine within the PIO block, 0..3. */
    sm: number;
    /** Pin label driven by the state machine. */
    pin: string;
    /** Informational program name, e.g. "ws2812". */
    program?: string;
    /** State machine clock in Hz (informational). */
    freqHz?: number;
}

export type PeripheralDef = UartDef | I2cDef | SpiDef | PwmDef | AdcDef | PioDef;

export interface LedDef {
    /** Macro name to emit, e.g. "LED_BUILTIN". */
    name: string;
    /** Pin label of the LED. */
    label: string;
    activeLow?: boolean;
}

export interface BoardModel {
    version: 1;
    /** Machine name, e.g. "oc1-rp2040". */
    name: string;
    /** Human readable name, e.g. "OC1 RP2040 Card". */
    displayName?: string;
    mcu: Mcu;
    clock?: {
        /** Crystal (XOSC) frequency in Hz. */
        xoscHz?: number;
        /** System clock in Hz. */
        sysHz?: number;
    };
    flash?: {
        /** Flashing method hint, e.g. "uf2", "esptool", "openocd". */
        method?: string;
        /** Flash size in KiB. */
        sizeKB?: number;
    };
    pins: PinDef[];
    peripherals?: PeripheralDef[];
    leds?: LedDef[];
}
