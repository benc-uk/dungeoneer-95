export const DIRECTIONS = ["north", "east", "south", "west"];
export const STEPS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
export const DOOR_STATES = ["closed", "open", "locked"];
export const DOOR_AXES = ["north_south", "east_west"];
export const ACTIONS = ["open", "close", "toggle"];
export const WALL_FEATURE_TYPES = ["button", "torch", "pillar"];
export const MONSTER_CLASSES = ["skeleton_warrior"];
export const MONSTER_STATES = ["idle", "dead"];
export const MONSTER_COUNTS = [1, 2, 3, 4];
export const key = (pos) => `${pos[0]},${pos[1]}`;
export const samePos = (a, b) => a != null && b != null && a[0] === b[0] && a[1] === b[1];
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const identifier = (v) => typeof v === "string" && v.trim().length > 0;
const integer = (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
export const position = (v) => Array.isArray(v) && v.length === 2 && v.every(integer);
const MAX_GESTURE_CELLS = 50000;

export function inspectDocument(data) {
  const errors = [];
  const problems = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  const fields = (value, allowed, required, path) => {
    if (!object(value)) { fail(path, "expected an object"); return false; }
    for (const field of Object.keys(value)) {
      if (!allowed.includes(field)) fail(`${path}.${field}`, "unsupported field; use an editor for this format");
    }
    for (const field of required) if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, "required");
    return true;
  };
  const choice = (v, allowed, path) => { if (!allowed.includes(v)) fail(path, `expected ${allowed.join(", ")}`); };
  const id = (v, path) => { if (!identifier(v)) fail(path, "expected a non-blank string"); };
  const pos = (v, path) => { if (!position(v)) fail(path, "expected [x, z] signed 32-bit integers"); };
  const rootFields = ["schema_version", "name", "player_start", "player_start_face", "cells", "features"];
  if (!fields(data, [...rootFields, "monsters"], rootFields, "level")) return { errors, problems };
  if (data.schema_version !== 1) fail("schema_version", "unsupported version; expected 1");
  id(data.name, "name");
  if (data.player_start !== null) pos(data.player_start, "player_start");
  choice(data.player_start_face, DIRECTIONS, "player_start_face");
  if (!Array.isArray(data.cells)) fail("cells", "expected an array");
  if (!Array.isArray(data.features)) fail("features", "expected an array");
  if (Object.hasOwn(data, "monsters") && !Array.isArray(data.monsters)) fail("monsters", "expected an array");
  const cells = new Map();
  const features = new Map();
  const monsters = new Map();
  for (const [index, cell] of (Array.isArray(data.cells) ? data.cells : []).entries()) {
    const path = `cells[${index}]`;
    if (!fields(cell, ["pos", "type", "main_feature", "wall_features", "monster_group"], ["pos", "type"], path)) continue;
    pos(cell.pos, `${path}.pos`);
    choice(cell.type, ["floor", "wall"], `${path}.type`);
    if (Object.hasOwn(cell, "main_feature")) id(cell.main_feature, `${path}.main_feature`);
    if (Object.hasOwn(cell, "monster_group")) id(cell.monster_group, `${path}.monster_group`);
    if (Object.hasOwn(cell, "wall_features") && fields(cell.wall_features, DIRECTIONS, [], `${path}.wall_features`)) {
      for (const [dir, value] of Object.entries(cell.wall_features)) id(value, `${path}.wall_features.${dir}`);
    }
    if (position(cell.pos)) {
      if (cells.has(key(cell.pos))) fail(path, `duplicate cell ${key(cell.pos)}`);
      cells.set(key(cell.pos), cell);
    }
  }
  for (const [index, feature] of (Array.isArray(data.features) ? data.features : []).entries()) {
    const path = `features[${index}]`;
    const doorFields = feature?.type === "door" ? ["state", "axis"] : [];
    if (!fields(feature, ["id", "type", "action_links", ...doorFields], ["id", "type", ...doorFields], path)) continue;
    id(feature.id, `${path}.id`);
    choice(feature.type, ["door", ...WALL_FEATURE_TYPES], `${path}.type`);
    if (feature.type === "door") {
      choice(feature.state, DOOR_STATES, `${path}.state`);
      choice(feature.axis, DOOR_AXES, `${path}.axis`);
    }
    if (Object.hasOwn(feature, "action_links") && !Array.isArray(feature.action_links)) fail(`${path}.action_links`, "expected an array");
    for (const [i, link] of (Array.isArray(feature.action_links) ? feature.action_links : []).entries()) {
      const linkPath = `${path}.action_links[${i}]`;
      if (!fields(link, ["target_id", "action"], ["target_id", "action"], linkPath)) continue;
      id(link.target_id, `${linkPath}.target_id`);
      choice(link.action, ACTIONS, `${linkPath}.action`);
    }
    if (identifier(feature.id)) {
      if (features.has(feature.id)) fail(path, `duplicate feature ID ${feature.id}`);
      features.set(feature.id, feature);
    }
  }
  for (const [index, monster] of (Array.isArray(data.monsters) ? data.monsters : []).entries()) {
    const path = `monsters[${index}]`;
    const monsterFields = ["id", "mon_class", "count", "state", "facing"];
    if (!fields(monster, monsterFields, monsterFields, path)) continue;
    id(monster.id, `${path}.id`);
    choice(monster.mon_class, MONSTER_CLASSES, `${path}.mon_class`);
    choice(monster.count, MONSTER_COUNTS, `${path}.count`);
    choice(monster.state, MONSTER_STATES, `${path}.state`);
    choice(monster.facing, DIRECTIONS, `${path}.facing`);
    if (identifier(monster.id)) {
      if (monsters.has(monster.id)) fail(path, `duplicate monster group ID ${monster.id}`);
      monsters.set(monster.id, monster);
    }
  }
  if (errors.length) return { errors, problems };
  const issue = (message, pos = null, feature_id = null, monster_id = null) => problems.push({ message, pos, feature_id, monster_id });
  const owners = new Map([...features.keys()].map((id) => [id, []]));
  const monsterOwners = new Map([...monsters.keys()].map((id) => [id, []]));
  for (const cell of cells.values()) {
    if (cell.monster_group) {
      if (!monsters.has(cell.monster_group)) issue(`Cell ${key(cell.pos)}: missing monster group ${cell.monster_group}.`, cell.pos, null, cell.monster_group);
      else {
        monsterOwners.get(cell.monster_group).push(cell.pos);
        if (cell.type !== "floor") issue(`${cell.monster_group} must be on a floor cell.`, cell.pos, null, cell.monster_group);
      }
    }
    const slots = { ...cell.wall_features };
    if (cell.main_feature) slots.centre = cell.main_feature;
    for (const [slot, featureId] of Object.entries(slots)) {
      const feature = features.get(featureId);
      if (!feature) { issue(`Cell ${key(cell.pos)}: missing feature ${featureId}.`, cell.pos); continue; }
      owners.get(featureId).push(cell.pos);
      if (cell.type !== "floor") issue(`${featureId} must be on a floor cell.`, cell.pos, featureId);
      if (slot === "centre") {
        if (feature.type !== "door") issue(`${featureId}: only doors belong in the centre slot.`, cell.pos, featureId);
      } else {
        if (!WALL_FEATURE_TYPES.includes(feature.type)) issue(`${featureId}: only buttons, torches and pillars belong on walls.`, cell.pos, featureId);
        const neighbour = [cell.pos[0] + STEPS[slot][0], cell.pos[1] + STEPS[slot][1]];
        if (cells.get(key(neighbour))?.type !== "wall") issue(`${featureId} needs a supporting wall to the ${slot}.`, cell.pos, featureId);
      }
    }
  }
  for (const feature of features.values()) {
    const placements = owners.get(feature.id);
    if (placements.length !== 1) issue(`${feature.id} has ${placements.length} placements; it needs exactly one.`, placements[0] ?? null, feature.id);
    const links = feature.action_links ?? [];
    if (feature.type !== "button" && links.length) issue(`${feature.id}: only buttons can have action links.`, placements[0], feature.id);
    for (const link of links) {
      if (features.get(link.target_id)?.type !== "door") issue(`${feature.id}: target ${link.target_id} must be an existing door.`, placements[0], feature.id);
    }
  }
  for (const monster of monsters.values()) {
    const locations = monsterOwners.get(monster.id);
    if (locations.length !== 1) issue(`${monster.id} has ${locations.length} placements; it needs exactly one.`, locations[0] ?? null, null, monster.id);
  }
  if (!data.cells.length) issue("Paint some floor and wall cells to start your level.");
  if (data.player_start === null) issue("Place the player spawn on a floor cell.");
  else {
    const cell = cells.get(key(data.player_start));
    const feature = features.get(cell?.main_feature);
    if (cell?.type !== "floor" || (feature?.type === "door" && feature.state !== "open")) {
      issue("Player spawn must be on an initially walkable floor cell.", data.player_start);
    }
  }
  return { errors, problems };
}

export function createLevel(data = {
  schema_version: 1, name: "Untitled", player_start: null, player_start_face: "north", cells: [], features: [],
}) {
  const { errors } = inspectDocument(data);
  if (errors.length) throw new Error(errors.join("\n"));
  const copy = structuredClone(data);
  return { ...copy, cells: new Map(copy.cells.map((cell) => [key(cell.pos), cell])),
    features: new Map(copy.features.map((feature) => [feature.id, feature])),
    monsters: new Map((copy.monsters ?? []).map((monster) => [monster.id, monster])) };
}

export function toDocument(level) {
  return {
    schema_version: 1, name: level.name, player_start: level.player_start?.slice() ?? null,
    player_start_face: level.player_start_face,
    cells: [...level.cells.values()].sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0]).map((cell) => {
      const result = { pos: cell.pos.slice(), type: cell.type };
      if (cell.main_feature) result.main_feature = cell.main_feature;
      if (cell.monster_group) result.monster_group = cell.monster_group;
      const walls = DIRECTIONS.filter((dir) => Object.hasOwn(cell.wall_features ?? {}, dir));
      if (walls.length) result.wall_features = Object.fromEntries(walls.map((dir) => [dir, cell.wall_features[dir]]));
      return result;
    }),
    features: [...level.features.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((feature) => {
      const result = { id: feature.id, type: feature.type };
      if (feature.type === "door") Object.assign(result, { state: feature.state, axis: feature.axis });
      if (feature.action_links?.length) result.action_links = structuredClone(feature.action_links);
      return result;
    }),
    ...(level.monsters.size ? { monsters: [...level.monsters.values()]
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      .map(({ id, mon_class, count, state, facing }) => ({ id, mon_class, count, state, facing })) } : {}),
  };
}

export const serializeLevel = (level) => JSON.stringify(toDocument(level), null, 2) + "\n";
export const validateLevel = (level) => inspectDocument(toDocument(level));

export function placements(level) {
  const result = new Map();
  for (const cell of level.cells.values()) {
    for (const [slot, id] of Object.entries({ ...cell.wall_features, ...(cell.main_feature ? { centre: cell.main_feature } : {}) })) {
      if (!result.has(id)) result.set(id, { pos: cell.pos, slot });
    }
  }
  return result;
}

export function monsterPlacements(level) {
  const result = new Map();
  for (const cell of level.cells.values()) {
    if (cell.monster_group && !result.has(cell.monster_group)) result.set(cell.monster_group, { pos: cell.pos, slot: "monster" });
  }
  return result;
}

export function removalImpact(level, ids, spawn = false, monsterIds = []) {
  const removed = new Set(ids);
  const links = [...level.features.values()].filter((f) => !removed.has(f.id))
    .reduce((n, f) => n + (f.action_links ?? []).filter((link) => removed.has(link.target_id)).length, 0);
  const monsters = [...new Set(monsterIds)].filter((id) => level.monsters.has(id)).length;
  return { features: [...removed].filter((id) => level.features.has(id)).length, links, spawn, monsters };
}

export function paintImpact(level, points, type) {
  const ids = new Set();
  const monsterIds = new Set();
  let spawn = false;
  if (type === "floor") return removalImpact(level, ids);
  for (const pos of points) {
    const cell = level.cells.get(key(pos));
    if (cell?.type === type) continue;
    if (cell?.main_feature) ids.add(cell.main_feature);
    for (const id of Object.values(cell?.wall_features ?? {})) ids.add(id);
    if (cell?.monster_group) monsterIds.add(cell.monster_group);
    if (samePos(pos, level.player_start)) spawn = true;
  }
  return removalImpact(level, ids, spawn, monsterIds);
}

export function deleteFeatures(level, ids) {
  const removed = new Set(ids);
  for (const id of removed) level.features.delete(id);
  for (const cell of level.cells.values()) {
    if (removed.has(cell.main_feature)) delete cell.main_feature;
    for (const [dir, id] of Object.entries(cell.wall_features ?? {})) if (removed.has(id)) delete cell.wall_features[dir];
  }
  for (const feature of level.features.values()) {
    if (feature.action_links) feature.action_links = feature.action_links.filter((link) => !removed.has(link.target_id));
  }
}

export function deleteMonsterGroups(level, ids) {
  const removed = new Set(ids);
  for (const id of removed) level.monsters.delete(id);
  for (const cell of level.cells.values()) {
    if (removed.has(cell.monster_group)) delete cell.monster_group;
  }
}

export function paintCells(level, points, type) {
  if (!["floor", "wall", "void"].includes(type)) throw new Error("Unknown paint type.");
  if (points.length > MAX_GESTURE_CELLS) throw new Error("Use smaller strokes: a single gesture can edit at most 50,000 cells.");
  if (!points.every(position)) throw new Error("Cell coordinates must be signed 32-bit integers.");
  const removed = new Set();
  const removedMonsters = new Set();
  for (const pos of points) {
    const old = level.cells.get(key(pos));
    if (old?.type === type) continue;
    if (type !== "floor") {
      if (old?.main_feature) removed.add(old.main_feature);
      for (const id of Object.values(old?.wall_features ?? {})) removed.add(id);
      if (old?.monster_group) removedMonsters.add(old.monster_group);
      if (samePos(pos, level.player_start)) level.player_start = null;
    }
    if (type === "void") level.cells.delete(key(pos));
    else level.cells.set(key(pos), type === "floor" && old ? { ...old, type } : { pos: pos.slice(), type });
  }
  deleteFeatures(level, removed);
  deleteMonsterGroups(level, removedMonsters);
}

export function addMonsterGroup(level, pos) {
  const cell = level.cells.get(key(pos));
  if (cell?.type !== "floor") throw new Error("Select a floor cell to add a monster group.");
  if (cell.monster_group) throw new Error("Remove the existing monster group before replacing it.");
  let index = 1;
  while (level.monsters.has(`monster_${index}`)) index++;
  const id = `monster_${index}`;
  level.monsters.set(id, { id, mon_class: "skeleton_warrior", count: 1, state: "idle", facing: "north" });
  cell.monster_group = id;
  return id;
}

export function addFeature(level, pos, slot, type) {
  const cell = level.cells.get(key(pos));
  if (cell?.type !== "floor") throw new Error("Select a floor cell to add a feature.");
  if (slot === "centre" ? type !== "door" : !DIRECTIONS.includes(slot) || !WALL_FEATURE_TYPES.includes(type)) {
    throw new Error("This feature does not belong in that slot.");
  }
  if (slot === "centre" ? cell.main_feature : cell.wall_features?.[slot]) throw new Error("Remove the existing feature before replacing it.");
  let index = 1;
  while (level.features.has(`${type}_${index}`)) index++;
  const id = `${type}_${index}`;
  const feature = { id, type };
  if (type === "door") Object.assign(feature, { state: "closed", axis: "north_south" });
  if (type === "button") feature.action_links = [];
  level.features.set(id, feature);
  if (slot === "centre") cell.main_feature = id;
  else { cell.wall_features ??= {}; cell.wall_features[slot] = id; }
  return id;
}

export function moveWallFeature(level, pos, from, to) {
  const cell = level.cells.get(key(pos));
  if (!DIRECTIONS.includes(to) || !cell?.wall_features?.[from]) throw new Error("Select an existing wall feature.");
  if (from === to) return;
  if (cell.wall_features[to]) throw new Error("That wall slot is occupied.");
  cell.wall_features[to] = cell.wall_features[from];
  delete cell.wall_features[from];
}

export function setSpawn(level, pos) {
  if (level.cells.get(key(pos))?.type !== "floor") throw new Error("Paint a floor cell before placing the player spawn.");
  level.player_start = pos.slice();
}

export function lineCells(a, b) {
  if (!position(a) || !position(b)) throw new Error("The brush is outside the supported coordinate range.");
  if (Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) >= MAX_GESTURE_CELLS) throw new Error("Use a smaller stroke.");
  const result = [];
  let [x, z] = a;
  const dx = Math.abs(b[0] - x), dz = -Math.abs(b[1] - z);
  const sx = x < b[0] ? 1 : -1, sz = z < b[1] ? 1 : -1;
  let error = dx + dz;
  for (;;) {
    result.push([x, z]);
    if (x === b[0] && z === b[1]) return result;
    const twice = 2 * error;
    if (twice >= dz) { error += dz; x += sx; }
    if (twice <= dx) { error += dx; z += sz; }
  }
}

export function rectangleCells(a, b) {
  if (!position(a) || !position(b)) throw new Error("The rectangle is outside the supported coordinate range.");
  const left = Math.min(a[0], b[0]), top = Math.min(a[1], b[1]);
  const width = Math.abs(a[0] - b[0]) + 1, height = Math.abs(a[1] - b[1]) + 1;
  if (width * height > MAX_GESTURE_CELLS) throw new Error("Use smaller rectangles: a gesture can edit at most 50,000 cells.");
  const result = [];
  for (let z = top; z < top + height; z++) for (let x = left; x < left + width; x++) result.push([x, z]);
  return result;
}

export class History {
  constructor(level = createLevel()) { this.reset(level); }
  reset(level) { this.present = level; this.past = []; this.future = []; }
  commit(next) {
    if (serializeLevel(next) === serializeLevel(this.present)) return false;
    this.past.push(this.present);
    if (this.past.length > 100) this.past.shift();
    this.present = next;
    this.future = [];
    return true;
  }
  undo() {
    if (!this.past.length) return false;
    this.future.push(this.present);
    this.present = this.past.pop();
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(this.present);
    this.present = this.future.pop();
    return true;
  }
}
