// Serial port discovery and the serial monitor connection.

import { SerialPort } from 'serialport';

// USB vendor ids of chips used on Uno-compatible boards.
const KNOWN_VIDS = {
  '2341': 'Arduino',
  '2a03': 'Arduino',
  '1a86': 'CH340',
  '0403': 'FTDI',
  '10c4': 'CP210x',
};

export async function listPorts() {
  let ports;
  try {
    ports = await SerialPort.list();
  } catch {
    // Linux lists ports with udevadm, which minimal systems may lack.
    return [];
  }
  return ports
    .map((p) => {
      const vid = (p.vendorId || '').toLowerCase();
      const known = KNOWN_VIDS[vid];
      return {
        path: p.path,
        label: known ? `${p.path} (STFKart / ${known})` : p.path,
        likelyBoard: Boolean(known),
        manufacturer: p.manufacturer || '',
      };
    })
    // Hide the many legacy /dev/ttyS* entries Linux reports without a device.
    .filter((p) => !/^\/dev\/ttyS\d+$/.test(p.path) || p.manufacturer)
    .sort((a, b) => Number(b.likelyBoard) - Number(a.likelyBoard) || a.path.localeCompare(b.path));
}

export class Monitor {
  constructor({ onData, onClose }) {
    this.port = null;
    this.onData = onData;
    this.onClose = onClose;
  }

  get isOpen() {
    return Boolean(this.port?.isOpen);
  }

  open(path, baudRate) {
    return new Promise((resolve, reject) => {
      this.close().then(() => {
        const port = new SerialPort({ path, baudRate: Number(baudRate), autoOpen: false });
        port.on('data', (d) => this.onData(d.toString('latin1')));
        // Only report closes we did not ask for, such as the cable being unplugged.
        port.on('close', () => {
          if (this.port !== port) return;
          this.port = null;
          this.onClose();
        });
        port.on('error', () => {});
        port.open((err) => {
          if (err) {
            reject(err);
            return;
          }
          this.port = port;
          this.config = { path, baudRate };
          resolve();
        });
      });
    });
  }

  write(text) {
    if (!this.isOpen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.port.write(Buffer.from(text, 'latin1'), (err) => (err ? reject(err) : resolve()));
    });
  }

  close() {
    const port = this.port;
    this.port = null;
    if (!port?.isOpen) return Promise.resolve();
    return new Promise((resolve) => port.close(() => resolve()));
  }
}
