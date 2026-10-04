extends SceneTree

var failures: int = 0
var checks: int = 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error("TEST FAILED: " + message)

func _run() -> void:
	var fixtures: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/world_state_cases.json"))
	for fixture in fixtures.cases:
		if not fixture.playable:
			continue
		var data: Dictionary = fixtures.base.duplicate(true)
		for edit in fixture.edits:
			var cursor: Variant = data
			for i in range(edit.path.size() - 1):
				var part: Variant = int(edit.path[i]) if cursor is Array else edit.path[i]
				cursor = cursor[part]
			var last: Variant = int(edit.path[-1]) if cursor is Array else edit.path[-1]
			cursor[last] = edit.value
		var loaded := WorldStateLoader.from_document(data, fixture.name)
		_check(loaded.loaded_ok, fixture.name + " constructs")
		_check(loaded.cells.size() == data.cells.size(), fixture.name + " preserves sparsity")
		_check(loaded.monsters.size() == data.get("monsters", []).size(), fixture.name + " preserves monster definitions")
		for record in data.get("monsters", []):
			var group := loaded.get_monster_group(StringName(record.id))
			_check(group != null, fixture.name + " registers monster group")
			if group != null:
				_check(group.mon_class == record.mon_class and group.count == int(record.count), "Monster class and count match JSON")
				_check(group.state == WorldState.MonsterGroup.State[record.state.to_upper()], "Monster state matches JSON")
				_check(group.facing == Grid.Dir[record.facing.to_upper()], "Monster facing matches JSON")
		for record in data.cells:
			_check(loaded.cells[Vector2i(int(record.pos[0]), int(record.pos[1]))].monster_group == StringName(record.get("monster_group", "")), "Cell monster reference matches JSON")
		for record in data.features:
			if record.type == "pillar":
				_check(loaded.get_feature(StringName(record.id)) is WorldState.PillarFeature, "Pillar definition constructs its model type")
		for feature in loaded.features.values():
			for link in feature.action_links:
				_check(link.target == loaded.get_feature(link.target_id), "Links use registered objects")

	var empty := WorldState.new()
	_check(empty.cells.is_empty() and empty.features.is_empty() and empty.monsters.is_empty() and not empty.loaded_ok, "State construction does not load a file")
	var world := WorldStateLoader.from_document(fixtures.base)
	_check(world.loaded_ok, "Base loads")
	_check(world.is_walkable(Vector2i.ZERO), "Floor is walkable")
	_check(not world.is_walkable(Vector2i(1, 0)), "Wall is blocked")
	_check(not world.is_walkable(Vector2i(-100, -100)), "Void is blocked")
	_check(not world.is_walkable(Vector2i(0, 1)), "Closed door blocks")
	world.interact_feature(&"button_1")
	_check(world.is_walkable(Vector2i(0, 1)), "Linked button opens door")
	world.interact_feature(&"button_1")
	_check(not world.is_walkable(Vector2i(0, 1)), "Linked button closes door")
	var ordered: Dictionary = fixtures.base.duplicate(true)
	ordered.features[0].action_links = [
		{"target_id": "door_1", "action": "open"},
		{"target_id": "door_1", "action": "close"},
	]
	world = WorldStateLoader.from_document(ordered)
	_check(world.loaded_ok, "Ordered links load")
	world.interact_feature(&"button_1")
	_check(not world.is_walkable(Vector2i(0, 1)), "Action order is preserved")

	_check_forgiving_loading(fixtures.base)
	_check_monster_loading(fixtures.base)
	_check_pillar_loading(fixtures.base)
	_check_load_failures(fixtures.base)

	var tomb := WorldStateLoader.load_level("tomb")
	_check(tomb.loaded_ok, "Tomb loads")
	_check(tomb.cells.size() == 132 and tomb.features.size() == 7, "Tomb geometry and features retained")
	_check(tomb.player_start == Vector2i(1, 6) and tomb.player_start_face == Grid.Dir.NORTH, "Tomb spawn retained")
	tomb.interact_feature(&"btn1")
	_check(tomb.is_walkable(Vector2i(2, 5)), "Tomb button opens its door")

	var game := (load("res://game.tscn") as PackedScene).instantiate()
	game.level_filename = "../tests/fixtures/directions"
	game.get_node("Music").autoplay = false
	root.add_child(game)
	_check(game.world_state.loaded_ok, "Directional fixture starts through Game")
	var visuals: Array = game.get_node("Map").get_children()
	for direction in Grid.Dir.values():
		var expected: float = Grid.dir_to_angle(direction) - Grid.dir_to_angle(Grid.Dir.WEST)
		var found := false
		for visual in visuals:
			if visual.scene_file_path == "res://templates/map_torch.tscn" and visual.position.is_equal_approx(Vector3.ZERO):
				if is_zero_approx(angle_difference(expected, visual.rotation.y)):
					found = true
		_check(found, "Torch matches cardinal wall %d" % direction)
	var doors_checked := 0
	for visual in visuals:
		if visual.scene_file_path == "res://templates/map_door.tscn":
			var east_west: bool = visual.position.is_equal_approx(Grid.cell_to_world(Vector2i(2, 2)))
			_check(is_zero_approx(angle_difference(PI / 2.0 if east_west else 0.0, visual.rotation.y)), "Door passage axis matches")
			doors_checked += 1
	_check(doors_checked == 2, "Both door axes rendered, including sparse boundary door")
	for direction in Grid.Dir.values():
		var pos := Vector2i(4 + direction, 0)
		var step: Vector2i = Grid.STEP[direction]
		var expected := Vector3(step.x, 0, step.y)
		var found := false
		for visual in visuals:
			if visual.scene_file_path != "res://templates/monster_group.tscn" or not visual.position.is_equal_approx(Grid.cell_to_world(pos)):
				continue
			found = true
			var warriors: Array = visual.get_node("Node3D").get_children()
			_check(not warriors.is_empty(), "Monster group contains models")
			for warrior in warriors:
				var model := warrior.get_node("Visual/Model") as Node3D
				var forward := (model.global_basis * Vector3(0, 0, 1)).normalized()
				_check(forward.is_equal_approx(expected), "Monster model faces %s" % Grid.Dir.find_key(direction))
		_check(found, "Monster group is rendered at %s" % pos)
	game.queue_free()
	await process_frame
	await process_frame

	var scene := load("res://templates/map_door.tscn") as PackedScene
	for state in WorldState.DoorFeature.State.values():
		var instance := scene.instantiate()
		root.add_child(instance)
		var feature := WorldState.DoorFeature.new(&"visual_test")
		feature.state = state
		instance.bind(feature)
		var door: Node3D = instance.get_node("Node3D/Door")
		var expected := 0.75 if state == WorldState.DoorFeature.State.OPEN else 0.007846534
		_check(is_equal_approx(door.position.y, expected), "Door initial visual matches state %d" % state)
		_check(not instance.get_node("Audio").playing, "Initial door binding is silent")
		instance.free()

	print("WORLD STATE TESTS: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)

func _check_forgiving_loading(base: Dictionary) -> void:
	print("Testing ignored references (warnings below are expected).")
	var missing: Dictionary = base.duplicate(true)
	missing.cells[1].wall_features.east = "missing_button"
	missing.cells[3].main_feature = "missing_door"
	var world := WorldStateLoader.from_document(missing)
	_check(world.loaded_ok and world.load_error.is_empty(), "Missing feature IDs do not fail the level")
	_check(world.cells[Vector2i(0, 1)].main_feature == &"", "Missing main feature is omitted")
	_check(not world.cells[Vector2i.ZERO].wall_features.has(Grid.Dir.EAST), "Missing wall feature is omitted")
	_check(world.is_walkable(Vector2i(0, 1)), "A missing door leaves its floor walkable")
	_check(world.get_feature(&"torch_1") is WorldState.TorchFeature, "Valid features are retained")

	var linked: Dictionary = base.duplicate(true)
	linked.features[0].action_links = [
		{"target_id": "door_1", "action": "open"},
		{"target_id": "missing", "action": "toggle"},
		{"target_id": "torch_1", "action": "open"},
		{"target_id": "door_1", "action": "activate"},
		{"target_id": "door_1", "action": "close"},
	]
	world = WorldStateLoader.from_document(linked)
	_check(world.loaded_ok, "Broken action links do not fail the level")
	var links := world.get_feature(&"button_1").action_links
	_check(links.size() == 2, "Only working links are retained")
	_check(links[0].action == WorldState.FeatureAction.OPEN and links[1].action == WorldState.FeatureAction.CLOSE, "Remaining links retain their order")
	world.interact_feature(&"button_1")
	_check(not world.is_walkable(Vector2i(0, 1)), "Remaining button links still execute")
	linked.features[0].action_links = [{"target_id": "missing", "action": "toggle"}]
	world = WorldStateLoader.from_document(linked)
	world.interact_feature(&"button_1")
	_check(world.loaded_ok and world.get_feature(&"button_1").action_links.is_empty(), "A button with no working links is harmless")

	var unknown: Dictionary = base.duplicate(true)
	unknown.features[1].type = "not_implemented"
	world = WorldStateLoader.from_document(unknown)
	_check(world.loaded_ok and not world.features.has(&"door_1"), "Unsupported features are ignored")
	_check(world.is_walkable(Vector2i(0, 1)), "Unsupported door definition leaves a floor")
	_check(world.get_feature(&"button_1").action_links.is_empty(), "Links to skipped definitions are ignored")

	var duplicate: Dictionary = base.duplicate(true)
	duplicate.features.append({"id": "button_1", "type": "button", "action_links": []})
	duplicate.cells.append({"pos": [0, 0], "type": "wall"})
	world = WorldStateLoader.from_document(duplicate)
	_check(world.loaded_ok, "Duplicate records do not fail loading")
	_check(world.get_feature(&"button_1").action_links.size() == 1, "First feature definition is retained")
	_check(world.is_walkable(Vector2i.ZERO), "First cell definition is retained")

	var authoring: Dictionary = base.duplicate(true)
	authoring.cells[2].type = "floor"
	authoring.notes = "Editor metadata does not need runtime validation."
	world = WorldStateLoader.from_document(authoring)
	_check(world.loaded_ok, "Missing wall support and extra fields are not runtime validation failures")
	_check(world.cells[Vector2i.ZERO].wall_features[Grid.Dir.EAST] == &"button_1", "Authored feature is retained without a wall-support audit")

func _check_pillar_loading(base: Dictionary) -> void:
	var world := WorldStateLoader.load_level("../tests/fixtures/wall_pillars")
	_check(world.loaded_ok, "Four-direction pillar fixture loads")
	if not world.loaded_ok:
		return
	_check(world.cells.size() == 5 and world.features.size() == 4, "Pillar fixture retains its sparse cells and definitions")
	_check(world.is_walkable(Vector2i.ZERO), "Pillars do not block the floor or spawn")
	for direction in Grid.Dir.values():
		var id := StringName("pillar_" + Grid.Dir.find_key(direction).left(1).to_lower())
		_check(world.cells[Vector2i.ZERO].wall_features.get(direction) == id, "Pillar keeps its authored cardinal slot")
		var pillar := world.get_feature(id)
		_check(pillar is WorldState.PillarFeature, "Registered feature is a pillar")
		if pillar is WorldState.PillarFeature:
			_check(not pillar.blocks_move() and pillar.action_links.is_empty(), "Pillar is decorative without movement or action behaviour")
			world.interact_feature(id)

	print("Testing ignored pillar action links (warnings below are expected).")
	var data := base.duplicate(true)
	data.features.append({
		"id": "pillar_1", "type": "pillar",
		"action_links": [{"target_id": "door_1", "action": "open"}],
	})
	data.cells[4].wall_features = {"north": "pillar_1"}
	data.features[0].action_links.append({"target_id": "pillar_1", "action": "toggle"})
	world = WorldStateLoader.from_document(data)
	_check(world.loaded_ok and world.load_error.is_empty(), "Optional pillar problems do not fail loading")
	var pillar := world.get_feature(&"pillar_1")
	_check(pillar is WorldState.PillarFeature and pillar.action_links.is_empty(), "Unsupported outgoing pillar actions are skipped")
	_check(world.cells[Vector2i(0, 2)].wall_features[Grid.Dir.NORTH] == &"pillar_1", "Runtime does not repeat pillar wall-support validation")
	_check(world.get_feature(&"button_1").action_links.size() == 1, "Button links cannot target pillars")
	world.interact_feature(&"pillar_1")
	_check(not world.is_walkable(Vector2i(0, 1)), "Interacting with a pillar has no action side effects")
	world.interact_feature(&"button_1")
	_check(world.is_walkable(Vector2i(0, 1)), "Valid door links still work alongside pillars")

func _check_load_failures(base: Dictionary) -> void:
	print("Testing unusable levels (load errors below are expected).")
	var invalid: Array = [null, [], {"cells": "not an array"}]
	for start in [null, [1, 0], [20, 20], [0, 1]]:
		var data: Dictionary = base.duplicate(true)
		data.player_start = start
		invalid.append(data)
	var no_facing: Dictionary = base.duplicate(true)
	no_facing.player_start_face = "up"
	invalid.append(no_facing)
	for data in invalid:
		var world := WorldStateLoader.from_document(data, "expected failure")
		_check(not world.loaded_ok and not world.load_error.is_empty(), "Unusable input reports failure")
		_check(world.cells.is_empty() and world.features.is_empty() and world.monsters.is_empty(), "Failure does not expose a partial world")
	var missing := WorldStateLoader.load_level("__missing_loader_test_%d" % Time.get_ticks_usec())
	_check(not missing.loaded_ok and missing.load_error.contains("Cannot read"), "Missing file reports its read failure")
	_check(WorldStateLoader.from_document(base).loaded_ok, "A subsequent valid load is independent of failures")

func _check_monster_loading(base: Dictionary) -> void:
	print("Testing monster loading (warnings below are expected).")
	var data := base.duplicate(true)
	var definition := {"id": "monster_1", "mon_class": "skeleton_warrior", "count": 4, "state": "dead", "facing": "west"}
	data.monsters = [definition]
	data.cells[4].monster_group = "monster_1"
	var world := WorldStateLoader.from_document(data)
	_check(world.loaded_ok and world.monsters.size() == 1, "Monster group loads")
	_check(world.is_walkable(Vector2i(0, 2)), "Monster occupancy does not change walkability")
	_check(world.get_monster_group(world.cells[Vector2i(0, 2)].monster_group) == world.monsters[&"monster_1"], "Cell uses the registered monster object")
	_check(world.get_monster_group(&"missing") == null, "Missing group lookup returns null")
	_check(WorldStateLoader.from_document(base).monsters.is_empty(), "Legacy levels still load without monsters")
	data.monsters = [{"id": "monster_1", "mon_class": "skeleton_warrior"}]
	world = WorldStateLoader.from_document(data)
	var defaults := world.get_monster_group(&"monster_1")
	_check(defaults.count == 1 and defaults.state == WorldState.MonsterGroup.State.IDLE and defaults.facing == Grid.Dir.NORTH, "Runtime uses model defaults for omitted group settings")
	data.monsters = [definition, {"id": "monster_1", "mon_class": "skeleton_warrior", "count": 1}]
	world = WorldStateLoader.from_document(data)
	_check(world.monsters.size() == 1 and world.get_monster_group(&"monster_1").count == 4, "First monster definition wins")

	var invalid_definitions: Array = [null, {"id": "", "mon_class": "skeleton_warrior"}]
	for property in ["mon_class", "state", "facing"]:
		var invalid := definition.duplicate()
		invalid[property] = "unsupported"
		invalid_definitions.append(invalid)
	for count in [0, 5, -1, 1.5, true, "2", null]:
		var invalid := definition.duplicate()
		invalid.count = count
		invalid_definitions.append(invalid)
	for invalid in invalid_definitions:
		data.monsters = [invalid, {"id": "valid", "mon_class": "skeleton_warrior", "count": 2}]
		world = WorldStateLoader.from_document(data)
		_check(world.loaded_ok and world.load_error.is_empty(), "Invalid optional monster does not fail level loading")
		_check(world.monsters.size() == 1 and world.monsters.has(&"valid"), "Invalid monster is skipped while valid groups survive")
		_check(world.cells[Vector2i(0, 2)].monster_group == &"", "References to skipped monsters are omitted")
	for collection in [null, {}, "invalid"]:
		data.monsters = collection
		world = WorldStateLoader.from_document(data)
		_check(world.loaded_ok and world.monsters.is_empty(), "Malformed optional monster collection is skipped")
		_check(world.cells[Vector2i(0, 2)].monster_group == &"", "Malformed collection leaves no dangling cell reference")
	data.monsters = [definition]
	data.cells[0].monster_group = "monster_1"
	world = WorldStateLoader.from_document(data)
	_check(world.loaded_ok and world.cells[Vector2i(0, -1)].monster_group == &"monster_1", "Runtime does not duplicate monster placement audits")
	data.player_start = null
	world = WorldStateLoader.from_document(data, "expected failure with monsters")
	_check(not world.loaded_ok and world.monsters.is_empty(), "Failed spawn does not expose partial monster state")
