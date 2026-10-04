import { DIRECTIONS, key, samePos, placements, lineCells, rectangleCells } from "./level.mjs";

const DEFAULT_SIZE = 48;
const wallOffset = { north: [0.5, 0.09], east: [0.91, 0.5], south: [0.5, 0.91], west: [0.09, 0.5], centre: [0.5, 0.5] };

export class MapCanvas {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("This browser does not support Canvas 2D.");
    const styles = getComputedStyle(document.documentElement);
    this.colors = Object.fromEntries([
      "void", "grid", "axis", "floor", "wall", "wall-hatch", "door", "locked-door",
      "button", "torch", "pillar", "monster", "monster-dead", "selection", "hover", "paint-floor", "paint-wall", "paint-erase",
      "marker-ink", "coordinates", "missing",
    ].map((name) => {
      const value = styles.getPropertyValue(`--map-${name}`).trim();
      if (!CSS.supports("color", value)) throw new Error(`Missing or invalid editor colour: --map-${name}`);
      return [name, value];
    }));
    this.hooks = hooks;
    this.size = DEFAULT_SIZE;
    this.offset = null;
    this.selection = [0, 0];
    this.slot = "centre";
    this.hover = null;
    this.drag = null;
    this.space = false;
    this.frame = null;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    canvas.addEventListener("pointercancel", () => this.cancel());
    canvas.addEventListener("lostpointercapture", () => this.cancel());
    canvas.addEventListener("pointerleave", () => { this.hover = null; this.drawSoon(); });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("focus", () => this.drawSoon());
    canvas.addEventListener("blur", () => this.drawSoon());
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.cancel();
      const [x, y] = this.local(event);
      this.zoom(Math.exp(-event.deltaY * 0.0015), x, y);
    }, { passive: false });
    canvas.addEventListener("keydown", (event) => {
      if (event.code === "Space") { event.preventDefault(); this.space = true; canvas.style.cursor = "grab"; }
      if (event.key === "Escape") this.cancel();
      const step = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] }[event.key];
      if (step) {
        event.preventDefault();
        const pos = [this.selection[0] + step[0], this.selection[1] + step[1]];
        this.hooks.select(pos, "centre");
        this.reveal(pos);
      }
      if (event.key === "Enter") { event.preventDefault(); this.apply([this.selection]); }
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") { this.space = false; canvas.style.cursor = "crosshair"; }
    });
    window.addEventListener("blur", () => { this.space = false; this.cancel(); canvas.style.cursor = "crosshair"; });
  }

  local(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  cellAt(event) {
    const [x, y] = this.local(event);
    return [Math.floor((x - this.offset[0]) / this.size), Math.floor((y - this.offset[1]) / this.size)];
  }
  hitSlot(event, pos) {
    const [x, y] = this.local(event);
    const fx = (x - this.offset[0]) / this.size - pos[0], fz = (y - this.offset[1]) / this.size - pos[1];
    const distance = [fz, 1 - fx, 1 - fz, fx];
    const nearest = DIRECTIONS[distance.indexOf(Math.min(...distance))];
    const cell = this.hooks.level().cells.get(key(pos));
    return Math.min(...distance) < 0.25 && cell?.wall_features?.[nearest] ? nearest : "centre";
  }
  pointerDown(event) {
    if (this.drag || ![0, 1].includes(event.button)) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const local = this.local(event);
    if (event.button === 1 || this.space) {
      this.drag = { pointer: event.pointerId, mode: "pan", local, offset: this.offset.slice() };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    const pos = this.cellAt(event);
    const tool = this.hooks.tool();
    this.hooks.select(pos, this.hitSlot(event, pos));
    if (tool === "select") return;
    if (tool === "spawn") { this.hooks.spawn(pos); return; }
    this.drag = { pointer: event.pointerId, mode: tool, rectangle: this.hooks.rectangle(), first: pos, last: pos, points: new Map([[key(pos), pos]]) };
    this.canvas.setPointerCapture(event.pointerId);
    this.drawSoon();
  }
  extend(pos) {
    if (samePos(pos, this.drag.last)) return;
    try {
      if (this.drag.rectangle) this.drag.points = new Map(rectangleCells(this.drag.first, pos).map((p) => [key(p), p]));
      else for (const point of lineCells(this.drag.last, pos)) this.drag.points.set(key(point), point);
      if (this.drag.points.size > 50000) throw new Error("Use a smaller stroke: a gesture can edit at most 50,000 cells.");
      this.drag.last = pos;
    } catch (error) {
      this.cancel();
      this.hooks.error(error);
    }
  }
  pointerMove(event) {
    if (!this.offset) return;
    this.hover = this.cellAt(event);
    this.hooks.hover(this.hover);
    if (this.drag?.pointer === event.pointerId) {
      if (this.drag.mode === "pan") {
        const local = this.local(event);
        this.offset = [this.drag.offset[0] + local[0] - this.drag.local[0], this.drag.offset[1] + local[1] - this.drag.local[1]];
      } else this.extend(this.hover);
    }
    this.drawSoon();
  }
  pointerUp(event) {
    if (this.drag?.pointer !== event.pointerId) return;
    if (this.drag.mode !== "pan") this.extend(this.cellAt(event));
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (drag.mode !== "pan") {
      this.hooks.select(drag.last, "centre");
      this.hooks.paint([...drag.points.values()], drag.mode);
    }
    this.drawSoon();
  }
  apply(points) {
    const tool = this.hooks.tool();
    if (tool === "spawn") this.hooks.spawn(points[0]);
    else if (tool !== "select") this.hooks.paint(points, tool);
  }
  cancel() {
    const pointer = this.drag?.pointer;
    this.drag = null;
    if (pointer !== undefined && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.drawSoon();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const oldWidth = this.width, oldHeight = this.height;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    if (!this.offset) this.offset = [(this.width - this.size) / 2, (this.height - this.size) / 2];
    else if (oldWidth) {
      this.offset[0] += (this.width - oldWidth) / 2;
      this.offset[1] += (this.height - oldHeight) / 2;
    }
    this.drawSoon();
  }
  zoom(factor, x = this.width / 2, y = this.height / 2) {
    const next = Math.max(0.125, Math.min(128, this.size * factor));
    this.offset = [x - (x - this.offset[0]) * next / this.size, y - (y - this.offset[1]) * next / this.size];
    this.size = next;
    this.drawSoon();
  }
  fit() {
    this.cancel();
    const cells = this.hooks.level().cells;
    if (!cells.size) {
      this.size = DEFAULT_SIZE;
      this.offset = [(this.width - this.size) / 2, (this.height - this.size) / 2];
    } else {
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const { pos: [x, z] } of cells.values()) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, z); bottom = Math.max(bottom, z); }
      const width = right - left + 1, height = bottom - top + 1;
      this.size = Math.max(0.125, Math.min(80, (this.width - 90) / width, (this.height - 100) / height));
      this.offset = [(this.width - width * this.size) / 2 - left * this.size, (this.height - height * this.size) / 2 - top * this.size];
    }
    this.drawSoon();
  }
  reveal(pos) {
    const x = this.offset[0] + (pos[0] + 0.5) * this.size, y = this.offset[1] + (pos[1] + 0.5) * this.size;
    if (x < 30 || x > this.width - 30 || y < 30 || y > this.height - 30) {
      this.offset = [this.width / 2 - (pos[0] + 0.5) * this.size, this.height / 2 - (pos[1] + 0.5) * this.size];
    }
    this.drawSoon();
  }
  drawSoon() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; if (this.offset) this.draw(); });
  }

  draw() {
    const ctx = this.ctx, s = this.size, [ox, oy] = this.offset;
    const colors = this.colors;
    const level = this.hooks.level();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.void;
    ctx.fillRect(0, 0, this.width, this.height);
    const stride = 2 ** Math.max(0, Math.ceil(Math.log2(12 / s)));
    const left = Math.floor(-ox / s / stride) * stride, top = Math.floor(-oy / s / stride) * stride;
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let x = left; x <= (this.width - ox) / s; x += stride) { const px = Math.floor(ox + x * s) + .5; ctx.moveTo(px, 0); ctx.lineTo(px, this.height); }
    for (let z = top; z <= (this.height - oy) / s; z += stride) { const py = Math.floor(oy + z * s) + .5; ctx.moveTo(0, py); ctx.lineTo(this.width, py); }
    ctx.stroke();
    ctx.strokeStyle = colors.axis;
    ctx.beginPath(); ctx.moveTo(ox + .5, 0); ctx.lineTo(ox + .5, this.height); ctx.moveTo(0, oy + .5); ctx.lineTo(this.width, oy + .5); ctx.stroke();
    for (const cell of level.cells.values()) {
      const x = ox + cell.pos[0] * s, y = oy + cell.pos[1] * s;
      if (x + s < 0 || y + s < 0 || x > this.width || y > this.height) continue;
      ctx.fillStyle = cell.type === "floor" ? colors.floor : colors.wall;
      ctx.fillRect(x + .7, y + .7, Math.max(.6, s - 1.4), Math.max(.6, s - 1.4));
      if (cell.type === "wall" && s >= 14) {
        ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 1, s - 2, s - 2); ctx.clip();
        ctx.strokeStyle = colors["wall-hatch"]; ctx.lineWidth = 1; ctx.beginPath();
        for (let step = -s; step < s * 2; step += 9) { ctx.moveTo(x + step, y); ctx.lineTo(x + step - s, y + s); }
        ctx.stroke(); ctx.restore();
      }
      if (cell.main_feature) this.drawFeature(level.features.get(cell.main_feature), x + s / 2, y + s / 2, "centre");
      for (const [slot, id] of Object.entries(cell.wall_features ?? {})) {
        const offset = wallOffset[slot];
        this.drawFeature(level.features.get(id), x + s * offset[0], y + s * offset[1], slot);
      }
      if (cell.monster_group) this.drawMonster(level.monsters.get(cell.monster_group), x + s * .7, y + s * .7);
    }
    const selected = level.cells.get(key(this.selection));
    const featureId = this.slot === "centre" ? selected?.main_feature : selected?.wall_features?.[this.slot];
    const feature = level.features.get(featureId);
    if (feature?.type === "button") {
      const owners = placements(level), start = wallOffset[this.slot];
      ctx.save(); ctx.strokeStyle = colors.selection; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      for (const link of feature.action_links ?? []) {
        const target = owners.get(link.target_id);
        if (!target) continue;
        ctx.beginPath(); ctx.moveTo(ox + (this.selection[0] + start[0]) * s, oy + (this.selection[1] + start[1]) * s);
        ctx.lineTo(ox + (target.pos[0] + .5) * s, oy + (target.pos[1] + .5) * s); ctx.stroke();
        ctx.strokeRect(ox + target.pos[0] * s + 2, oy + target.pos[1] * s + 2, s - 4, s - 4);
      }
      ctx.restore();
    }
    if (level.player_start) {
      const [x, z] = level.player_start;
      const sharesMonsterCell = Boolean(level.cells.get(key(level.player_start))?.monster_group);
      const centre = sharesMonsterCell ? .38 : .5;
      ctx.save(); ctx.translate(ox + (x + centre) * s, oy + (z + centre) * s);
      ctx.rotate(DIRECTIONS.indexOf(level.player_start_face) * Math.PI / 2);
      const r = Math.max(2, s * (sharesMonsterCell ? .22 : .27));
      ctx.fillStyle = colors.selection; ctx.strokeStyle = colors["marker-ink"]; ctx.lineWidth = Math.max(1, s * .035);
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .72, r * .75); ctx.lineTo(0, r * .38); ctx.lineTo(-r * .72, r * .75); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (this.drag?.points) {
      ctx.fillStyle = this.drag.mode === "void" ? colors["paint-erase"] : this.drag.mode === "wall" ? colors["paint-wall"] : colors["paint-floor"];
      for (const [x, z] of this.drag.points.values()) ctx.fillRect(ox + x * s, oy + z * s, s, s);
    }
    if (level.cells.size || this.hover || this.drag || document.activeElement === this.canvas) {
      ctx.strokeStyle = colors.selection; ctx.lineWidth = 2;
      ctx.strokeRect(ox + this.selection[0] * s + 1.5, oy + this.selection[1] * s + 1.5, Math.max(1, s - 3), Math.max(1, s - 3));
    }
    if (this.hover && !this.drag) {
      ctx.strokeStyle = colors.hover; ctx.lineWidth = 1;
      ctx.strokeRect(ox + this.hover[0] * s + 2, oy + this.hover[1] * s + 2, Math.max(1, s - 4), Math.max(1, s - 4));
    }
    ctx.font = "10px Consolas, monospace"; ctx.textBaseline = "top";
    const label = (text, x, y) => {
      ctx.fillStyle = colors.void;
      ctx.fillRect(x - 2, y - 1, ctx.measureText(text).width + 4, 12);
      ctx.fillStyle = colors.coordinates;
      ctx.fillText(text, x, y);
    };
    for (let x = left; x < (this.width - ox) / s; x += stride * 4) label(String(x), ox + x * s + 4, 4);
    for (let z = top; z < (this.height - oy) / s; z += stride * 4) label(String(z), 4, oy + z * s + 4);
    this.hooks.zoom(`${Math.round(s / DEFAULT_SIZE * 1000) / 10}%`);
  }

  drawMonster(monster, x, y) {
    const ctx = this.ctx, s = this.size, r = Math.max(2, s * .16);
    ctx.save(); ctx.translate(x, y);
    if (!monster) {
      ctx.fillStyle = this.colors.missing; ctx.font = "bold 12px sans-serif"; ctx.fillText("!", -3, 4);
      ctx.restore(); return;
    }
    ctx.fillStyle = monster.state === "dead" ? this.colors["monster-dead"] : this.colors.monster;
    ctx.strokeStyle = this.colors["marker-ink"]; ctx.lineWidth = Math.max(1, s * .02);
    ctx.save(); ctx.rotate(DIRECTIONS.indexOf(monster.facing) * Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -r * 1.7); ctx.lineTo(r * .65, -r * .7); ctx.lineTo(-r * .65, -r * .7);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (s >= 28) {
      ctx.fillStyle = this.colors["marker-ink"]; ctx.font = `bold ${Math.max(9, r * 1.2)}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`${monster.count}${monster.state === "dead" ? "x" : ""}`, 0, 0);
    } else if (monster.state === "dead") {
      ctx.beginPath(); ctx.moveTo(-r * .6, -r * .6); ctx.lineTo(r * .6, r * .6);
      ctx.moveTo(r * .6, -r * .6); ctx.lineTo(-r * .6, r * .6); ctx.stroke();
    }
    ctx.restore();
  }

  drawFeature(feature, x, y, slot) {
    const ctx = this.ctx, s = this.size;
    const colors = this.colors;
    if (!feature) {
      ctx.fillStyle = colors.missing; ctx.font = "bold 12px sans-serif"; ctx.fillText("!", x - 3, y - 6); return;
    }
    ctx.save(); ctx.translate(x, y);
    if (feature.type === "door") {
      if (feature.axis === "east_west") ctx.rotate(Math.PI / 2);
      const half = Math.max(2, s * .38), thickness = Math.max(2, s * .12);
      ctx.fillStyle = feature.state === "locked" ? colors["locked-door"] : colors.door;
      if (feature.state === "open") {
        ctx.fillRect(-half, -thickness / 2, half * .3, thickness);
        ctx.fillRect(half * .7, -thickness / 2, half * .3, thickness);
      } else {
        ctx.fillRect(-half, -thickness / 2, half * 2, thickness);
        if (feature.state === "locked" && s > 25) { ctx.fillStyle = colors["marker-ink"]; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("L", 0, 0); }
      }
    } else {
      const r = Math.max(2, Math.min(8, s * .14));
      ctx.fillStyle = colors[feature.type];
      ctx.strokeStyle = colors["marker-ink"]; ctx.lineWidth = 1;
      ctx.beginPath();
      if (feature.type === "button") ctx.rect(-r / 1.1, -r / 1.1, r * 1.8, r * 1.8);
      else if (feature.type === "pillar") ctx.arc(0, 0, r, 0, Math.PI * 2);
      else { ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); }
      ctx.fill(); ctx.stroke();
      if (feature.type === "pillar") {
        ctx.beginPath(); ctx.arc(0, 0, r * .45, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
