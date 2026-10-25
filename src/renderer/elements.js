// Drawings that @wokwi/elements doesn't have: the STFKart board itself and
// a plain labeled module. Like the wokwi elements, each exposes `pinInfo`
// ({ name, x, y } in px from its top-left corner) so wires can attach.

import { BOARD, BOARD_GEOMETRY, PIN_BY_ID } from '../common/board.js';

const SVG = 'http://www.w3.org/2000/svg';
const PITCH = 9.6;

function node(tag, attrs, parent) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}

function text(parent, x, y, value, attrs = {}) {
  node('text', { x, y, ...attrs }, parent).textContent = value;
}

const short = (name) => name.replace(/\.\d$/, '').replace(/^D(\d+)$/, '$1');

class StfBoard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const { width, height, pins } = BOARD_GEOMETRY;
    const root = this.attachShadow({ mode: 'open' });
    const svg = node('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    svg.style.display = 'block';
    root.append(svg);
    const font = 'font-family: monospace; font-weight: 600';

    node('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 6, fill: '#3b2f86', stroke: '#2a2160' }, svg);
    for (const [cx, cy] of [[15, 7], [width - 10, 40], [width - 10, 150], [15, 190]]) {
      node('circle', { cx, cy, r: 4, fill: '#1e1e1e', stroke: '#c9a227', 'stroke-width': 1.5 }, svg);
    }
    node('rect', { x: -6, y: 30, width: 46, height: 40, rx: 2, fill: '#b9bec5', stroke: '#8a9097' }, svg); // USB
    node('rect', { x: -2, y: 150, width: 40, height: 34, rx: 3, fill: '#222' }, svg); // power jack
    node('rect', { x: 120, y: 112, width: 104, height: 26, rx: 2, fill: '#1c1d20' }, svg); // MCU
    for (let i = 0; i < 14; i++) {
      node('rect', { x: 123 + i * 7.2, y: 108, width: 3, height: 4, fill: '#9aa0a8' }, svg);
      node('rect', { x: 123 + i * 7.2, y: 138, width: 3, height: 4, fill: '#9aa0a8' }, svg);
    }
    text(svg, 172, 129, BOARD.mcu, { 'text-anchor': 'middle', fill: '#9aa0a8', style: `${font}; font-size: 9px` });
    text(svg, 58, 98, BOARD.name, { fill: '#fff', style: `${font}; font-size: 20px` });
    text(svg, 59, 110, 'Uno compatible', { fill: '#d8d2ff', style: `${font}; font-size: 7px` });
    node('rect', { x: 104, y: 38, width: 6, height: 4, fill: '#f0c040' }, svg); // L led
    text(svg, 112, 42, 'L', { fill: '#d8d2ff', style: `${font}; font-size: 6px` });

    // Headers: a black strip with a hole for each pin, labels inside the board.
    const strips = new Map();
    for (const p of Object.values(pins)) {
      const k = `${p.y}:${p.x < 165 ? 'l' : 'r'}`;
      const s = strips.get(k) ?? { y: p.y, x0: p.x, x1: p.x };
      s.x0 = Math.min(s.x0, p.x);
      s.x1 = Math.max(s.x1, p.x);
      strips.set(k, s);
    }
    for (const s of strips.values()) {
      node('rect', { x: s.x0 - 4.8, y: s.y - 4.8, width: s.x1 - s.x0 + 9.6, height: 9.6, fill: '#141414' }, svg);
    }
    for (const [name, p] of Object.entries(pins)) {
      node('rect', { x: p.x - 1.6, y: p.y - 1.6, width: 3.2, height: 3.2, fill: '#555' }, svg);
      const top = p.y < height / 2;
      const ly = top ? p.y + 8 : p.y - 8;
      const label = node('text', {
        x: p.x, y: ly,
        transform: `rotate(-90 ${p.x} ${ly})`,
        'text-anchor': top ? 'end' : 'start',
        'dominant-baseline': 'middle',
        fill: PIN_BY_ID[name] ? '#fff' : '#d8d2ff',
        style: `${font}; font-size: 5.5px`,
      }, svg);
      label.textContent = (PIN_BY_ID[name]?.pwm ? '~' : '') + short(name);
    }
    text(svg, 194, 38, 'DIGITAL (PWM ~)', { 'text-anchor': 'middle', fill: '#d8d2ff', style: `${font}; font-size: 6px` });
    text(svg, 125, 168, 'POWER', { 'text-anchor': 'middle', fill: '#d8d2ff', style: `${font}; font-size: 6px` });
    text(svg, 197, 168, 'ANALOG IN', { 'text-anchor': 'middle', fill: '#d8d2ff', style: `${font}; font-size: 6px` });
  }

  get pinInfo() {
    return Object.entries(BOARD_GEOMETRY.pins).map(([name, p]) => ({ name, x: p.x, y: p.y }));
  }
}

// <stf-module label="DS18B20" pins="GND,DQ,VDD">: a small board with a
// header along its bottom edge.
class StfModule extends HTMLElement {
  static observedAttributes = ['label', 'pins'];

  get pinNames() {
    return (this.getAttribute('pins') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  get size() {
    const n = this.pinNames.length;
    return { width: Math.max(64, n * PITCH + 24), height: 44 };
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.draw();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.draw();
  }

  draw() {
    const { width, height } = this.size;
    const svg = node('svg', { width, height: height + 6, viewBox: `0 0 ${width} ${height + 6}` });
    svg.style.display = 'block';
    node('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 3, fill: '#1f5e3a', stroke: '#164a2c' }, svg);
    text(svg, width / 2, 16, this.getAttribute('label') ?? '', {
      'text-anchor': 'middle', fill: '#fff', style: 'font: 600 10px monospace',
    });
    this.pinInfo.forEach(({ name, x, y }) => {
      node('rect', { x: x - 1, y: y - 10, width: 2, height: 16, fill: '#c0c4ca' }, svg);
      text(svg, x, y - 13, name, { 'text-anchor': 'middle', fill: '#e8f4ec', style: 'font: 600 5.5px monospace' });
    });
    this.shadowRoot.replaceChildren(svg);
  }

  get pinInfo() {
    const names = this.pinNames;
    const { width, height } = this.size;
    const x0 = width / 2 - ((names.length - 1) * PITCH) / 2;
    return names.map((name, i) => ({ name, x: x0 + i * PITCH, y: height + 4 }));
  }
}

if (!customElements.get('stf-board')) customElements.define('stf-board', StfBoard);
if (!customElements.get('stf-module')) customElements.define('stf-module', StfModule);
