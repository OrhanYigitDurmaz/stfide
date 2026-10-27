// The circuit canvas: the STFKart and the parts around it, with wires.
// Drag parts to move them, click a pin to start a wire, click empty space
// to bend it, click another pin to finish. Drag the background to pan,
// scroll to zoom. Delete removes the selection, R rotates a part.

import { BOARD_PART, PARTS, partLabel } from '../common/parts.js';
import { addPart, addWire, removePart, removeWire, wireColorFor } from '../common/circuit.js';
import './elements.js';

const SVG = 'http://www.w3.org/2000/svg';

export const WIRE_COLORS = {
  green: '#1f9d48',
  red: '#d93636',
  black: '#2b2b2b',
  blue: '#2f6fd6',
  yellow: '#d6b11f',
  orange: '#e07a1f',
  purple: '#8a4fd1',
  white: '#f2f2f2',
};

function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}

// Orthogonal path through the given points. Without bends, the wire leaves
// and enters its pins vertically (headers point up or down).
export function route(a, b, points = []) {
  if (!points.length) {
    if (a.x === b.x || a.y === b.y) return [a, b];
    const mid = Math.round((a.y + b.y) / 2);
    return [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b];
  }
  const nodes = [a, ...points.map(([x, y]) => ({ x, y })), b];
  const out = [nodes[0]];
  for (let i = 1; i < nodes.length; i++) {
    const p = nodes[i - 1];
    const q = nodes[i];
    if (p.x !== q.x && p.y !== q.y) out.push(i === nodes.length - 1 ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
    out.push(q);
  }
  return out;
}

const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

export class CircuitCanvas {
  // getCircuit(): the current circuit
  // setCircuit(next, select): store an edited circuit, optionally selecting
  // onSelect(sel): sel is { kind: 'part' | 'wire' | 'board', id } or null
  constructor(host, { getCircuit, setCircuit, onSelect, onUndo, onRedo }) {
    this.host = host;
    this.getCircuit = getCircuit;
    this.setCircuit = setCircuit;
    this.onSelect = onSelect;
    this.onUndo = onUndo;
    this.onRedo = onRedo;
    this.view = { x: 40, y: 40, zoom: 1.5 };
    this.selection = null;
    this.marks = new Map();
    this.wiring = null; // { from: { part, pin }, points: [[x, y]] }
    this.wrappers = new Map();
    this.fitted = false;

    host.classList.add('circuit-canvas');
    host.tabIndex = 0;
    this.world = document.createElement('div');
    this.world.className = 'world';
    this.overlay = svg('svg', { class: 'overlay', width: 1, height: 1 });
    this.wireLayer = svg('g', {}, this.overlay);
    this.preview = svg('polyline', { class: 'wire preview' }, this.overlay);
    this.pinLayer = svg('g', {}, this.overlay);
    this.tip = document.createElement('div');
    this.tip.className = 'pin-tip';
    this.tip.hidden = true;
    this.world.append(this.overlay);
    host.append(this.world, this.tip);

    host.addEventListener('pointerdown', (e) => this.pointerDown(e));
    host.addEventListener('pointermove', (e) => this.pointerMove(e));
    host.addEventListener('pointerup', (e) => this.pointerUp(e));
    host.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    host.addEventListener('keydown', (e) => this.keyDown(e));
    new ResizeObserver(() => {
      if (!this.fitted && host.clientWidth) this.fit();
    }).observe(host);
  }

  // ---- drawing ----------------------------------------------------------

  // marks: Map of board pin -> color, for pins set up by hand.
  render(selection, marks = new Map()) {
    this.selection = selection;
    this.marks = marks;
    const circuit = this.getCircuit();
    const keep = new Set([BOARD_PART]);

    this.syncWrapper(BOARD_PART, 'stf-board', {}, circuit.board.x, circuit.board.y, 0);
    for (const part of circuit.parts) {
      const def = PARTS[part.type];
      const attrs = { ...(def.attrs ?? {}) };
      for (const o of def.options ?? []) if (o.attr) attrs[o.attr] = part.options[o.key];
      this.syncWrapper(part.id, def.tag, attrs, part.x, part.y, part.rotate);
      this.wrappers.get(part.id).title = `${part.name} (${partLabel(part.type)})`;
      keep.add(part.id);
    }
    for (const [id, w] of this.wrappers) {
      if (!keep.has(id)) {
        w.remove();
        this.wrappers.delete(id);
      }
    }
    for (const [id, w] of this.wrappers) {
      w.classList.toggle('selected', selection?.id === id && (selection.kind === 'part' || (id === BOARD_PART && selection.kind === 'board')));
    }
    this.applyView();
    this.drawWires();
    // Wokwi elements draw themselves asynchronously; redraw once they have a size.
    const pending = [...this.wrappers.values()].map((w) => w.firstChild.updateComplete).filter(Boolean);
    Promise.all(pending).then(() => requestAnimationFrame(() => this.drawWires()));
  }

  // Changes an attribute on a part's drawing before the change is committed,
  // e.g. resistor bands while the value is being typed.
  previewAttr(id, attr, value) {
    this.wrappers.get(id)?.firstChild.setAttribute(attr, value);
  }

  syncWrapper(id, tag, attrs, x, y, rotate) {
    let w = this.wrappers.get(id);
    if (!w || w.firstChild.localName !== tag) {
      w?.remove();
      w = document.createElement('div');
      w.className = id === BOARD_PART ? 'part board' : 'part';
      w.dataset.part = id;
      w.append(document.createElement(tag));
      this.world.insertBefore(w, this.overlay);
      this.wrappers.set(id, w);
    }
    const el = w.firstChild;
    for (const [k, v] of Object.entries(attrs)) if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v);
    w.style.left = `${x}px`;
    w.style.top = `${y}px`;
    w.style.transform = rotate ? `rotate(${rotate}deg)` : '';
    w.dataset.rotate = rotate;
  }

  // World position of every pin of a part.
  pinsOf(id) {
    const w = this.wrappers.get(id);
    if (!w) return [];
    const info = w.firstChild.pinInfo ?? [];
    const x0 = parseFloat(w.style.left);
    const y0 = parseFloat(w.style.top);
    const cx = w.offsetWidth / 2;
    const cy = w.offsetHeight / 2;
    const a = (Number(w.dataset.rotate) * Math.PI) / 180;
    const cos = Math.round(Math.cos(a));
    const sin = Math.round(Math.sin(a));
    return info.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return { name: p.name, x: Math.round((x0 + cx + dx * cos - dy * sin) * 10) / 10, y: Math.round((y0 + cy + dx * sin + dy * cos) * 10) / 10 };
    });
  }

  pinPos(end) {
    return this.pinsOf(end.part).find((p) => p.name === end.pin);
  }

  drawWires() {
    const circuit = this.getCircuit();
    this.wireLayer.replaceChildren();
    this.pinLayer.replaceChildren();
    const connected = new Map();
    for (const w of circuit.wires) {
      const a = this.pinPos(w.from);
      const b = this.pinPos(w.to);
      if (!a || !b) continue;
      const pts = pointsAttr(route(a, b, w.points));
      const selected = this.selection?.kind === 'wire' && this.selection.id === w.id;
      const g = svg('g', { class: `wire-group${selected ? ' selected' : ''}`, 'data-wire': w.id }, this.wireLayer);
      svg('polyline', { class: 'wire-hit', points: pts }, g);
      svg('polyline', { class: 'wire', points: pts, stroke: WIRE_COLORS[w.color] ?? w.color }, g);
      connected.set(`${w.from.part}:${w.from.pin}`, w.color);
      connected.set(`${w.to.part}:${w.to.pin}`, w.color);
    }

    for (const id of this.wrappers.keys()) {
      for (const p of this.pinsOf(id)) {
        const k = `${id}:${p.name}`;
        const color = connected.get(k);
        const mark = id === BOARD_PART ? this.marks.get(p.name) : null;
        const active = this.wiring && this.wiring.from.part === id && this.wiring.from.pin === p.name;
        const c = svg('circle', {
          class: `pin-hit${color ? ' connected' : ''}${mark ? ' marked' : ''}${active ? ' active' : ''}`,
          cx: p.x, cy: p.y, r: 3.4, 'data-part': id, 'data-pin': p.name,
        }, this.pinLayer);
        if (color) c.style.setProperty('--wire', WIRE_COLORS[color] ?? color);
        if (mark) c.style.setProperty('--mark', mark);
      }
    }
    this.drawPreview();
  }

  drawPreview(mouse) {
    if (!this.wiring) {
      this.preview.setAttribute('points', '');
      return;
    }
    const a = this.pinPos(this.wiring.from);
    const end = mouse ?? this.lastMouse ?? a;
    const pts = route(a, end, this.wiring.points);
    this.preview.setAttribute('points', pointsAttr(pts));
  }

  applyView() {
    const { x, y, zoom } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    this.host.style.backgroundSize = `${9.6 * zoom}px ${9.6 * zoom}px`;
    this.host.style.backgroundPosition = `${x}px ${y}px`;
  }

  // Zooms so the whole circuit fits.
  fit() {
    if (!this.host.clientWidth) return;
    this.fitted = true;
    const boxes = [...this.wrappers.values()].map((w) => {
      const x = parseFloat(w.style.left);
      const y = parseFloat(w.style.top);
      return [x, y, x + (w.offsetWidth || 60), y + (w.offsetHeight || 60)];
    });
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b[0]));
    const y0 = Math.min(...boxes.map((b) => b[1]));
    const x1 = Math.max(...boxes.map((b) => b[2]));
    const y1 = Math.max(...boxes.map((b) => b[3]));
    const pad = 40;
    const zoom = Math.min(2.5, (this.host.clientWidth - pad * 2) / (x1 - x0), (this.host.clientHeight - pad * 2) / (y1 - y0));
    this.view.zoom = Math.max(0.3, zoom);
    this.view.x = (this.host.clientWidth - (x1 - x0) * this.view.zoom) / 2 - x0 * this.view.zoom;
    this.view.y = (this.host.clientHeight - (y1 - y0) * this.view.zoom) / 2 - y0 * this.view.zoom;
    this.applyView();
  }

  zoomBy(factor, sx = this.host.clientWidth / 2, sy = this.host.clientHeight / 2) {
    const zoom = Math.min(5, Math.max(0.3, this.view.zoom * factor));
    const k = zoom / this.view.zoom;
    this.view.x = sx - (sx - this.view.x) * k;
    this.view.y = sy - (sy - this.view.y) * k;
    this.view.zoom = zoom;
    this.applyView();
  }

  toWorld(e) {
    const r = this.host.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.x) / this.view.zoom, y: (e.clientY - r.top - this.view.y) / this.view.zoom };
  }

  center() {
    return this.toWorld({
      clientX: this.host.getBoundingClientRect().left + this.host.clientWidth / 2,
      clientY: this.host.getBoundingClientRect().top + this.host.clientHeight / 2,
    });
  }

  // ---- editing ----------------------------------------------------------

  // Adds a part near the middle of the view, in a free spot.
  add(type, takenNames) {
    const c = this.center();
    const boxes = [...this.wrappers.values()].map((w) => {
      const x = parseFloat(w.style.left);
      const y = parseFloat(w.style.top);
      return [x - 12, y - 12, x + w.offsetWidth + 12, y + w.offsetHeight + 12];
    });
    const free = (x, y) => !boxes.some(([x0, y0, x1, y1]) => x < x1 && x + 70 > x0 && y < y1 && y + 70 > y0);
    let at = { x: c.x - 35, y: c.y - 35 };
    search: for (let ring = 0; ring < 30; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
          const x = c.x - 35 + dx * 40;
          const y = c.y - 35 + dy * 40;
          if (free(x, y)) {
            at = { x, y };
            break search;
          }
        }
      }
    }
    const r = addPart(this.getCircuit(), type, Math.round(at.x), Math.round(at.y), takenNames);
    this.setCircuit(r.circuit, { kind: 'part', id: r.part.id });
  }

  deleteSelection() {
    const sel = this.selection;
    if (sel?.kind === 'part') this.setCircuit(removePart(this.getCircuit(), sel.id), null);
    else if (sel?.kind === 'wire') this.setCircuit(removeWire(this.getCircuit(), sel.id), null);
  }

  rotateSelection() {
    const sel = this.selection;
    if (sel?.kind !== 'part') return;
    const next = structuredClone(this.getCircuit());
    const part = next.parts.find((p) => p.id === sel.id);
    part.rotate = (part.rotate + 90) % 360;
    this.setCircuit(next, sel);
  }

  cancelWire() {
    this.wiring = null;
    this.host.classList.remove('wiring');
    this.drawWires();
  }

  // ---- input ------------------------------------------------------------

  pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    this.host.focus({ preventScroll: true });
    this.tip.hidden = true;
    const world = this.toWorld(e);
    const pin = e.target.closest?.('.pin-hit');
    const wire = e.target.closest?.('.wire-group');
    const part = e.target.closest?.('.part');

    if (e.button === 1) {
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    } else if (pin) {
      const end = { part: pin.dataset.part, pin: pin.dataset.pin };
      if (!this.wiring) {
        this.wiring = { from: end, points: [] };
        this.host.classList.add('wiring');
        this.drawWires();
      } else if (this.wiring.from.part === end.part && this.wiring.from.pin === end.pin) {
        this.cancelWire();
      } else {
        const { from, points } = this.wiring;
        this.wiring = null;
        this.host.classList.remove('wiring');
        const next = addWire(this.getCircuit(), from, end, points, wireColorFor(from, end));
        const added = next.wires.length > this.getCircuit().wires.length ? next.wires[next.wires.length - 1] : null;
        this.setCircuit(next, added ? { kind: 'wire', id: added.id } : this.selection);
      }
      e.preventDefault();
      return;
    } else if (this.wiring) {
      // A bend in the wire, lined up with the previous point.
      const last = this.wiring.points.at(-1) ?? [this.pinPos(this.wiring.from).x, this.pinPos(this.wiring.from).y];
      const p = [Math.round(world.x), Math.round(world.y)];
      if (Math.abs(p[0] - last[0]) < Math.abs(p[1] - last[1])) p[0] = last[0];
      else p[1] = last[1];
      this.wiring.points.push(p);
      this.drawPreview(world);
      return;
    } else if (wire) {
      this.onSelect({ kind: 'wire', id: wire.dataset.wire });
    } else if (part) {
      const id = part.dataset.part;
      this.onSelect(id === BOARD_PART ? { kind: 'board', id } : { kind: 'part', id });
      this.drag = { kind: 'move', id, sx: e.clientX, sy: e.clientY, x: parseFloat(part.style.left), y: parseFloat(part.style.top), moved: false };
    } else {
      if (this.selection) this.onSelect(null);
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    }
    this.host.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  pointerMove(e) {
    const world = this.toWorld(e);
    this.lastMouse = world;
    if (this.wiring) this.drawPreview(world);
    const pin = !this.drag && e.target.closest?.('.pin-hit');
    if (pin) {
      const r = this.host.getBoundingClientRect();
      const part = pin.dataset.part === BOARD_PART ? 'STFKart' : this.getCircuit().parts.find((p) => p.id === pin.dataset.part)?.name;
      this.tip.textContent = `${part}: ${pin.dataset.pin.replace(/\.\d$/, '')}`;
      this.tip.style.left = `${e.clientX - r.left + 12}px`;
      this.tip.style.top = `${e.clientY - r.top - 26}px`;
      this.tip.hidden = false;
    } else {
      this.tip.hidden = true;
    }

    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === 'pan') {
      this.view.x = d.vx + dx;
      this.view.y = d.vy + dy;
      this.applyView();
    } else if (d.kind === 'move') {
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      const w = this.wrappers.get(d.id);
      w.style.left = `${Math.round(d.x + dx / this.view.zoom)}px`;
      w.style.top = `${Math.round(d.y + dy / this.view.zoom)}px`;
      this.drawWires();
    }
  }

  pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    if (d?.kind !== 'move' || !d.moved) return;
    const w = this.wrappers.get(d.id);
    const next = structuredClone(this.getCircuit());
    const target = d.id === BOARD_PART ? next.board : next.parts.find((p) => p.id === d.id);
    target.x = parseFloat(w.style.left);
    target.y = parseFloat(w.style.top);
    this.setCircuit(next, this.selection);
  }

  wheel(e) {
    e.preventDefault();
    const r = this.host.getBoundingClientRect();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  keyDown(e) {
    if (e.target !== this.host) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (this.wiring) this.cancelWire();
      else this.onSelect(null);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelection();
    } else if ((e.key === 'r' || e.key === 'R') && !mod) {
      this.rotateSelection();
    } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      this.onUndo();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      this.onRedo();
    } else if (e.key === '+' || e.key === '=') {
      this.zoomBy(1.2);
    } else if (e.key === '-') {
      this.zoomBy(1 / 1.2);
    } else {
      return;
    }
    e.preventDefault();
  }
}
