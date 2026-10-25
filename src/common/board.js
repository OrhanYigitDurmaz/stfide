// STFKart board definition. The STFKart is electrically an Arduino Uno
// (ATmega328P @ 16 MHz), so this mirrors the Uno R3 header layout.
// When the real STFKart hardware differs, this file and
// resources/hardware/stfkart/avr/boards.txt are the places to change.

export const BOARD = {
  id: 'stfkart',
  name: 'STFKart',
  mcu: 'ATmega328P',
  // Defined in resources/hardware/stfkart/avr/boards.txt on top of arduino:avr.
  fqbn: 'stfkart:avr:stfkart',
  ledBuiltin: 'D13',
  peripherals: {
    serial: { pins: ['D0', 'D1'], labels: { D0: 'RX', D1: 'TX' } },
    i2c: { pins: ['A4', 'A5'], labels: { A4: 'SDA', A5: 'SCL' } },
    // D10 (SS) must stay an output while SPI runs as master, so it may be
    // used as a chip-select output and is not claimed outright.
    spi: { pins: ['D11', 'D12', 'D13'], labels: { D10: 'SS', D11: 'MOSI', D12: 'MISO', D13: 'SCK' } },
  },
};

// timer: which hardware timer drives analogWrite() on that pin.
// Servo uses Timer1 (D9/D10), tone() uses Timer2 (D3/D11).
const DIGITAL = [
  { id: 'D0', arduino: 0 },
  { id: 'D1', arduino: 1 },
  { id: 'D2', arduino: 2, interrupt: 0 },
  { id: 'D3', arduino: 3, interrupt: 1, pwm: true, timer: 2 },
  { id: 'D4', arduino: 4 },
  { id: 'D5', arduino: 5, pwm: true, timer: 0 },
  { id: 'D6', arduino: 6, pwm: true, timer: 0 },
  { id: 'D7', arduino: 7 },
  { id: 'D8', arduino: 8 },
  { id: 'D9', arduino: 9, pwm: true, timer: 1 },
  { id: 'D10', arduino: 10, pwm: true, timer: 1 },
  { id: 'D11', arduino: 11, pwm: true, timer: 2 },
  { id: 'D12', arduino: 12 },
  { id: 'D13', arduino: 13 },
];

const ANALOG = [0, 1, 2, 3, 4, 5].map((n) => ({ id: `A${n}`, arduino: `A${n}`, analog: true }));

export const PINS = [...DIGITAL, ...ANALOG].map((p) => ({ pwm: false, analog: false, ...p }));

export const PIN_BY_ID = Object.fromEntries(PINS.map((p) => [p.id, p]));

// Header order for drawing the board (Uno R3 layout).
export const HEADERS = {
  top: ['D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'],
  bottom: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
  power: ['IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN'],
};
