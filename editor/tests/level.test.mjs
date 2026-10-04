import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLevel, inspectDocument, serializeLevel, toDocument, validateLevel, key, DIRECTIONS, STEPS,
  paintCells, paintImpact, deleteFeatures, removalImpact, addFeature, moveWallFeature,
  setSpawn, lineCells, rectangleCells, History, addMonsterGroup, deleteMonsterGroups, monsterPlacements,
} from "../level.mjs";

const fixtures = JSON.parse(readFileSync(new URL("../../tests/fixtures/world_state_cases.json", import.meta.url), "utf8"));
const pillarFixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/wall_pillars.json", import.meta.url), "utf8"));
for (const fixture of fixtures.cases) {
  test(`contract: ${fixture.name}`, () => {
    const data = structuredClone(fixtures.base);
    for (const edit of fixture.edits) {
      let at = data;
      for (const part of edit.path.slice(0, -1)) at = at[part];
      at[edit.path.at(-1)] = structuredClone(edit.value);
    }
    const report = inspectDocument(data);
    assert.equal(report.errors.length === 0, fixture.structural, JSON.stringify(report));
    assert.equal(report.errors.length === 0 && report.problems.length === 0, fixture.playable, JSON.stringify(report));
    if (fixture.structural) {
      const reloaded = createLevel(JSON.parse(serializeLevel(createLevel(data))));
      assert.equal(validateLevel(reloaded).problems.length === 0, fixture.playable);
      assert.equal(serializeLevel(reloaded), serializeLevel(createLevel(data)));
    } else assert.throws(() => createLevel(data));
  });
}

test("Tomb migration is sparse, playable and retains intended content", () => {
  const tomb = createLevel(JSON.parse(readFileSync(new URL("../../levels/tomb.json", import.meta.url), "utf8")));
  assert.deepEqual(validateLevel(tomb), { errors: [], problems: [] });
  assert.equal(tomb.cells.size, 132);
  assert.equal(tomb.features.size, 7);
  assert.deepEqual(tomb.player_start, [1, 6]);
  assert.equal(tomb.player_start_face, "north");
  assert.deepEqual(tomb.features.get("btn1").action_links, [{ target_id: "door_2_5", action: "toggle" }]);
  assert.equal([...tomb.features.values()].filter((f) => f.type === "torch").length, 3);
});

test("directional rendering fixture is also accepted by the editor", () => {
  const data = JSON.parse(readFileSync(new URL("../../tests/fixtures/directions.json", import.meta.url), "utf8"));
  assert.deepEqual(inspectDocument(data), { errors: [], problems: [] });
});

test("sparse cells never expand bounds and view state is not saved", () => {
  const level = createLevel();
  paintCells(level, [[-1000, -2000], [1000, 2000]], "floor");
  level.zoom = 4;
  level.selection = [-1000, -2000];
  const doc = toDocument(level);
  assert.equal(doc.cells.length, 2);
  assert.equal("zoom" in doc, false);
  assert.equal("selection" in doc, false);
  assert.equal(doc.player_start, null);
});

test("painting a populated cell clears owners, incoming links and spawn atomically", () => {
  const level = createLevel(fixtures.base);
  level.player_start = [0, 1];
  assert.deepEqual(paintImpact(level, [[0, 1]], "void"), { features: 1, links: 1, spawn: true, monsters: 0 });
  paintCells(level, [[0, 1]], "void");
  assert.equal(level.cells.has("0,1"), false);
  assert.equal(level.features.has("door_1"), false);
  assert.deepEqual(level.features.get("button_1").action_links, []);
  assert.equal(level.player_start, null);
});

test("floor repaint preserves features and produces no undo entry", () => {
  const history = new History(createLevel(fixtures.base));
  const next = structuredClone(history.present);
  paintCells(next, [[0, 0]], "floor");
  assert.equal(history.commit(next), false);
  assert.equal(next.cells.get("0,0").wall_features.east, "button_1");
});

test("undo and redo restore every reference and a new edit clears redo", () => {
  const history = new History(createLevel(fixtures.base));
  const original = serializeLevel(history.present);
  const next = structuredClone(history.present);
  paintCells(next, [[0, 1]], "wall");
  assert.equal(history.commit(next), true);
  assert.equal(history.past.length, 1);
  history.undo();
  assert.equal(serializeLevel(history.present), original);
  history.redo();
  assert.equal(history.present.features.has("door_1"), false);
  history.undo();
  const other = structuredClone(history.present);
  other.name = "Another name";
  history.commit(other);
  assert.equal(history.redo(), false);
});

test("feature removal detaches multiple invalid placements and retains link order", () => {
  const level = createLevel(fixtures.base);
  level.features.get("button_1").action_links = [
    { target_id: "door_1", action: "open" }, { target_id: "door_1", action: "close" },
  ];
  assert.deepEqual(toDocument(level).features[0].action_links.map((link) => link.action), ["open", "close"]);
  assert.deepEqual(removalImpact(level, ["door_1"]), { features: 1, links: 2, spawn: false, monsters: 0 });
  deleteFeatures(level, ["door_1"]);
  assert.equal(level.cells.get("0,1").main_feature, undefined);
  assert.deepEqual(level.features.get("button_1").action_links, []);
});

test("adding and moving features preserves IDs and enforces occupied slots", () => {
  const level = createLevel();
  paintCells(level, [[0, 0]], "floor");
  const id = addFeature(level, [0, 0], "north", "torch");
  assert.throws(() => addFeature(level, [0, 0], "north", "button"), /existing feature/);
  moveWallFeature(level, [0, 0], "north", "west");
  assert.equal(level.cells.get("0,0").wall_features.west, id);
  assert.equal(level.cells.get("0,0").wall_features.north, undefined);
  const next = addFeature(level, [0, 0], "north", "torch");
  assert.notEqual(next, id);
  assert.throws(() => moveWallFeature(level, [0, 0], "west", "north"), /occupied/);
  assert.throws(() => addFeature(level, [0, 0], "centre", "torch"), /slot/);
});

test("wall pillars round-trip all four floor edges without extra properties", () => {
  const level = createLevel(pillarFixture);
  assert.deepEqual(validateLevel(level), { errors: [], problems: [] });
  const reloaded = createLevel(JSON.parse(serializeLevel(level)));
  assert.deepEqual(reloaded, level);
  for (const direction of DIRECTIONS) {
    const id = reloaded.cells.get("0,0").wall_features[direction];
    assert.deepEqual(reloaded.features.get(id), { id, type: "pillar" });
  }
});

test("pillar editing uses stable IDs, wall-only slots and the existing undo pipeline", () => {
  const level = createLevel();
  paintCells(level, [[0, 0]], "floor");
  paintCells(level, Object.values(STEPS), "wall");
  setSpawn(level, [0, 0]);
  const history = new History(level);
  let next = structuredClone(history.present);
  const id = addFeature(next, [0, 0], "north", "pillar");
  assert.equal(id, "pillar_1");
  assert.throws(() => addFeature(next, [0, 0], "north", "torch"), /existing feature/);
  assert.throws(() => addFeature(next, [0, 0], "centre", "pillar"), /slot/);
  assert.throws(() => addFeature(next, [0, -1], "south", "pillar"), /floor/);
  assert.throws(() => addFeature(next, [2, 2], "south", "pillar"), /floor/);
  history.commit(next);
  history.undo();
  assert.equal(history.present.features.size, 0);
  history.redo();
  next = structuredClone(history.present);
  moveWallFeature(next, [0, 0], "north", "west");
  assert.equal(next.cells.get("0,0").wall_features.west, id);
  assert.equal(next.cells.get("0,0").wall_features.north, undefined);
  history.commit(next);
  history.undo();
  assert.equal(history.present.cells.get("0,0").wall_features.north, id);
  history.redo();
  next = structuredClone(history.present);
  assert.equal(addFeature(next, [0, 0], "north", "pillar"), "pillar_2");
  assert.throws(() => moveWallFeature(next, [0, 0], "west", "north"), /occupied/);
  assert.deepEqual(validateLevel(next), { errors: [], problems: [] });
});

test("removing a pillar or painting its floor is atomic and undoable", () => {
  for (const operation of ["remove", "wall", "void"]) {
    const level = createLevel(pillarFixture);
    const history = new History(level);
    const original = serializeLevel(level);
    const next = structuredClone(level);
    if (operation === "remove") deleteFeatures(next, ["pillar_n"]);
    else {
      assert.deepEqual(paintImpact(next, [[0, 0]], operation), { features: 4, links: 0, spawn: true, monsters: 0 });
      paintCells(next, [[0, 0]], operation);
    }
    history.commit(next);
    assert.equal(history.present.features.has("pillar_n"), false);
    assert.equal(history.present.cells.get("0,0")?.wall_features?.north, undefined);
    history.undo();
    assert.equal(serializeLevel(history.present), original);
    history.redo();
    assert.equal(history.present.features.has("pillar_n"), false);
  }
});

test("pillar support deletion keeps the definition and reports exactly one problem", () => {
  const level = createLevel(pillarFixture);
  paintCells(level, [[0, -1]], "void");
  assert.equal(level.features.has("pillar_n"), true);
  const { errors, problems } = validateLevel(level);
  assert.deepEqual(errors, []);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].feature_id, "pillar_n");
  assert.deepEqual(problems[0].pos, [0, 0]);
  assert.match(problems[0].message, /supporting wall to the north/);
});

test("deleting a pillar also removes invalid incoming links without changing valid links", () => {
  const level = createLevel(fixtures.base);
  const id = addFeature(level, [0, 2], "west", "pillar");
  level.features.get("button_1").action_links.push({ target_id: id, action: "toggle" });
  assert.deepEqual(removalImpact(level, [id]), { features: 1, links: 1, spawn: false, monsters: 0 });
  deleteFeatures(level, [id]);
  assert.deepEqual(level.features.get("button_1").action_links, [{ target_id: "door_1", action: "toggle" }]);
  assert.deepEqual(validateLevel(level), { errors: [], problems: [] });
});

test("supporting-wall deletion is reported without silently deleting the feature", () => {
  const level = createLevel(fixtures.base);
  paintCells(level, [[1, 0]], "void");
  assert.equal(level.features.has("button_1"), true);
  assert.ok(validateLevel(level).problems.some((p) => p.message.includes("supporting wall")));
});

test("spawn remains a single separate position", () => {
  const level = createLevel(fixtures.base);
  setSpawn(level, [0, 2]);
  assert.deepEqual(level.player_start, [0, 2]);
  assert.throws(() => setSpawn(level, [100, 100]), /floor/);
  assert.throws(() => setSpawn(level, [1, 0]), /floor/);
});

test("interpolated strokes cover both endpoints without gaps in any octant", () => {
  for (const end of [[8, 2], [2, 8], [-8, 2], [-2, -8], [8, -2], [0, -8], [-8, 0], [0, 0]]) {
    const points = lineCells([0, 0], end);
    assert.deepEqual(points[0], [0, 0]);
    assert.deepEqual(points.at(-1), end);
    assert.equal(new Set(points.map(key)).size, points.length);
    for (let i = 1; i < points.length; i++) {
      assert.equal(Math.max(Math.abs(points[i][0] - points[i - 1][0]), Math.abs(points[i][1] - points[i - 1][1])), 1);
    }
  }
});

test("rectangle bounds are inclusive in either drag direction", () => {
  const expected = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]];
  assert.deepEqual(rectangleCells([-1, -1], [1, 0]), expected);
  assert.deepEqual(rectangleCells([1, 0], [-1, -1]), expected);
  assert.throws(() => rectangleCells([0, 0], [1000, 1000]), /smaller/);
  assert.throws(() => lineCells([0, 0], [50000, 0]), /smaller/);
});

test("invalid edits do not partially mutate the document", () => {
  const level = createLevel(fixtures.base);
  const before = serializeLevel(level);
  assert.throws(() => paintCells(level, [[3, 3], [0.5, 2]], "floor"), /integers/);
  assert.equal(serializeLevel(level), before);
});

test("monster groups use a separate slot with stable IDs and properties", () => {
  const level = createLevel(fixtures.base);
  const id = addMonsterGroup(level, [0, 1]);
  const group = level.monsters.get(id);
  Object.assign(group, { count: 4, state: "dead", facing: "west" });
  assert.equal(level.cells.get("0,1").main_feature, "door_1");
  assert.equal(level.cells.get("0,1").monster_group, id);
  assert.deepEqual(monsterPlacements(level).get(id), { pos: [0, 1], slot: "monster" });
  const reloaded = createLevel(JSON.parse(serializeLevel(level)));
  assert.deepEqual(reloaded.monsters.get(id), group);
  assert.deepEqual(validateLevel(reloaded), { errors: [], problems: [] });
  assert.throws(() => addMonsterGroup(level, [0, 1]), /existing monster/);
  assert.throws(() => addMonsterGroup(level, [1, 0]), /floor/);
  assert.throws(() => addMonsterGroup(level, [100, 100]), /floor/);
  assert.notEqual(addMonsterGroup(level, [0, 2]), id);
});

test("monster collection is optional and empty collections normalise away", () => {
  const legacy = createLevel(fixtures.base);
  assert.equal(legacy.monsters.size, 0);
  assert.equal(Object.hasOwn(toDocument(legacy), "monsters"), false);
  const explicit = createLevel({ ...fixtures.base, monsters: [] });
  assert.equal(serializeLevel(explicit), serializeLevel(legacy));
});

test("monster output sorts by ID without changing imported IDs or record fields", () => {
  const level = createLevel(fixtures.base);
  level.monsters.set("z group", { id: "z group", mon_class: "skeleton_warrior", count: 2, state: "idle", facing: "east" });
  level.monsters.set("A group", { id: "A group", mon_class: "skeleton_warrior", count: 3, state: "dead", facing: "south" });
  level.cells.get("0,1").monster_group = "z group";
  level.cells.get("0,2").monster_group = "A group";
  assert.deepEqual(toDocument(level).monsters.map((group) => group.id), ["A group", "z group"]);
  assert.deepEqual(validateLevel(level), { errors: [], problems: [] });
  const text = serializeLevel(level);
  assert.equal(serializeLevel(createLevel(JSON.parse(text))), text);
});

test("monster edits and populated-cell removal undo and redo as complete operations", () => {
  for (const type of ["wall", "void"]) {
    const level = createLevel(fixtures.base);
    const id = addMonsterGroup(level, [0, 1]);
    level.player_start = [0, 1];
    const history = new History(level);
    const original = serializeLevel(level);
    const edited = structuredClone(history.present);
    Object.assign(edited.monsters.get(id), { count: 4, state: "dead", facing: "east" });
    history.commit(edited);
    history.undo();
    assert.equal(serializeLevel(history.present), original);
    history.redo();
    const beforeRemoval = serializeLevel(history.present);
    const next = structuredClone(history.present);
    assert.deepEqual(paintImpact(next, [[0, 1]], type), { features: 1, links: 1, spawn: true, monsters: 1 });
    paintCells(next, [[0, 1]], type);
    history.commit(next);
    assert.equal(history.present.monsters.size, 0);
    assert.equal(history.present.cells.get("0,1")?.monster_group, undefined);
    assert.equal(history.present.features.has("door_1"), false);
    assert.equal(history.present.player_start, null);
    history.undo();
    assert.equal(serializeLevel(history.present), beforeRemoval);
    history.redo();
    assert.equal(history.present.monsters.size, 0);
  }
});

test("floor repaint preserves groups and does not add a history entry", () => {
  const level = createLevel(fixtures.base);
  const id = addMonsterGroup(level, [0, 2]);
  const history = new History(level);
  const next = structuredClone(level);
  assert.deepEqual(paintImpact(next, [[0, 2]], "floor"), { features: 0, links: 0, spawn: false, monsters: 0 });
  paintCells(next, [[0, 2]], "floor");
  assert.equal(next.cells.get("0,2").monster_group, id);
  assert.equal(history.commit(next), false);
});

test("group deletion clears dangling or multiple placements without touching features", () => {
  const level = createLevel(fixtures.base);
  const id = addMonsterGroup(level, [0, 1]);
  level.cells.get("0,2").monster_group = id;
  assert.deepEqual(removalImpact(level, [], false, [id, id]), { features: 0, links: 0, spawn: false, monsters: 1 });
  deleteMonsterGroups(level, [id]);
  assert.equal(level.monsters.size, 0);
  assert.equal(level.cells.get("0,1").monster_group, undefined);
  assert.equal(level.cells.get("0,2").monster_group, undefined);
  assert.equal(level.cells.get("0,1").main_feature, "door_1");
  assert.equal(level.features.get("button_1").action_links.length, 1);
  level.cells.get("0,2").monster_group = "missing";
  deleteMonsterGroups(level, ["missing"]);
  assert.deepEqual(validateLevel(level), { errors: [], problems: [] });
});

test("feature and monster IDs have separate registries", () => {
  const level = createLevel(fixtures.base);
  const id = addMonsterGroup(level, [0, 2]);
  const group = level.monsters.get(id);
  level.monsters.delete(id);
  group.id = "door_1";
  level.monsters.set(group.id, group);
  level.cells.get("0,2").monster_group = group.id;
  deleteFeatures(level, ["door_1"]);
  assert.equal(level.monsters.has("door_1"), true);
  assert.deepEqual(validateLevel(level), { errors: [], problems: [] });
});

test("monster placement problems are reported once regardless of feature count", () => {
  for (const withFeatures of [false, true]) {
    const level = createLevel(withFeatures ? fixtures.base : {
      schema_version: 1, name: "Only monsters", player_start: [0, 0], player_start_face: "north",
      cells: [{ pos: [0, 0], type: "floor" }], features: [],
    });
    const id = addMonsterGroup(level, [0, 0]);
    delete level.cells.get("0,0").monster_group;
    assert.deepEqual(validateLevel(level), { errors: [], problems: [
      { message: `${id} has 0 placements; it needs exactly one.`, pos: null, feature_id: null, monster_id: id },
    ] });
    level.cells.get("0,0").monster_group = "missing";
    const problems = validateLevel(level).problems;
    assert.equal(problems.length, 2);
    assert.deepEqual(problems[0].pos, [0, 0]);
    assert.equal(problems[0].monster_id, "missing");
  }
});
