class_name WorldStateLoader
extends RefCounted

static func load_level(filename: String) -> WorldState:
	var path := "res://levels/%s.json" % filename
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _failed("Cannot read %s: %s" % [path, error_string(FileAccess.get_open_error())])
	var text := file.get_as_text()
	var read_error := file.get_error()
	file.close()
	if read_error != OK and read_error != ERR_FILE_EOF:
		return _failed("Cannot read %s: %s" % [path, error_string(read_error)])
	var json := JSON.new()
	if json.parse(text) != OK:
		return _failed("%s, line %d: %s" % [path, json.get_error_line(), json.get_error_message()])
	return from_document(json.data, path)

static func from_document(data: Variant, source: String = "level") -> WorldState:
	if not data is Dictionary or not data.get("cells") is Array or not data.get("features", []) is Array:
		return _failed("%s: expected a level object with cells and features arrays." % source)

	var world := WorldState.new()
	world.level_name = str(data.get("name", ""))
	_load_monsters(world, data.get("monsters", []), source)
	var pending_links: Dictionary = {}
	for record in data.get("features", []):
		if not record is Dictionary:
			push_warning("%s: ignoring an invalid feature record." % source)
			continue
		var id := StringName(str(record.get("id", "")))
		if id == &"" or world.features.has(id):
			push_warning("%s: ignoring empty or duplicate feature ID '%s'." % [source, id])
			continue
		var feature := _create_feature(record, id, source)
		if feature != null:
			world.features[id] = feature
			pending_links[id] = record.get("action_links", [])

	for record in data.cells:
		if not record is Dictionary:
			push_warning("%s: ignoring an invalid cell record." % source)
			continue
		var pos: Variant = _position(record.get("pos"))
		var type: int = WorldState.CellType.get(str(record.get("type", "")).to_upper(), -1)
		if pos == null or type == -1:
			push_warning("%s: ignoring a cell with an invalid position or type." % source)
			continue
		if world.cells.has(pos):
			push_warning("%s: ignoring duplicate cell %s." % [source, pos])
			continue
		var cell := WorldState.Cell.new(type)
		cell.main_feature = _feature_id(world, record.get("main_feature", ""), source)
		var monster_id := StringName(str(record.get("monster_group", "")))
		if monster_id != &"" and not world.monsters.has(monster_id):
			push_warning("%s: ignoring unknown monster group '%s'." % [source, monster_id])
		else:
			cell.monster_group = monster_id
		var walls: Variant = record.get("wall_features", {})
		if walls is Dictionary:
			for direction in walls:
				var face: int = Grid.Dir.get(str(direction).to_upper(), -1)
				if face == -1:
					push_warning("%s: ignoring unknown wall direction '%s'." % [source, direction])
					continue
				var id := _feature_id(world, walls[direction], source)
				if id != &"":
					cell.wall_features[face] = id
		else:
			push_warning("%s: ignoring invalid wall features at %s." % [source, pos])
		world.cells[pos] = cell

	for id in pending_links:
		_connect_links(world, world.features[id], pending_links[id], source)

	var spawn: Variant = _position(data.get("player_start"))
	var facing: int = Grid.Dir.get(str(data.get("player_start_face", "")).to_upper(), -1)
	if spawn == null or facing == -1 or not world.is_walkable(spawn):
		return _failed("%s: player spawn needs a walkable floor cell and a cardinal facing." % source)
	world.player_start = spawn
	world.player_start_face = facing
	world.load_error = ""
	world.loaded_ok = true
	return world

static func _load_monsters(world: WorldState, records: Variant, source: String) -> void:
	if not records is Array:
		push_warning("%s: ignoring invalid monsters collection." % source)
		return
	for record in records:
		if not record is Dictionary:
			push_warning("%s: ignoring an invalid monster group record." % source)
			continue
		var id := StringName(str(record.get("id", "")))
		if str(id).strip_edges().is_empty() or world.monsters.has(id):
			push_warning("%s: ignoring empty or duplicate monster group ID '%s'." % [source, id])
			continue
		var count: Variant = record.get("count", 1)
		var state: int = WorldState.MonsterGroup.State.get(str(record.get("state", "idle")).to_upper(), -1)
		var facing: int = Grid.Dir.get(str(record.get("facing", "north")).to_upper(), -1)
		if record.get("mon_class") != "skeleton_warrior" or state == -1 or facing == -1:
			push_warning("%s: ignoring monster group '%s' with unsupported class, state or facing." % [source, id])
			continue
		if not (count is int or count is float) or not is_finite(count) or count != floor(count) or count < 1 or count > 4:
			push_warning("%s: ignoring monster group '%s' with count outside 1 to 4." % [source, id])
			continue
		var group := WorldState.MonsterGroup.new()
		group.mon_class = record.mon_class
		group.count = int(count)
		group.state = state
		group.facing = facing
		world.monsters[id] = group

static func _create_feature(record: Dictionary, id: StringName, source: String) -> WorldState.Feature:
	match record.get("type"):
		"door":
			var state: int = WorldState.DoorFeature.State.get(str(record.get("state", "closed")).to_upper(), -1)
			var axis: int = WorldState.DoorFeature.Axis.get(str(record.get("axis", "north_south")).to_upper(), -1)
			if state != -1 and axis != -1:
				var door := WorldState.DoorFeature.new(id)
				door.state = state
				door.axis = axis
				return door
		"button": return WorldState.ButtonFeature.new(id)
		"torch": return WorldState.TorchFeature.new(id)
		"pillar": return WorldState.PillarFeature.new(id)
	push_warning("%s: ignoring feature '%s' with an unsupported type or door setting." % [source, id])
	return null

static func _connect_links(world: WorldState, feature: WorldState.Feature, records: Variant, source: String) -> void:
	if not records is Array:
		push_warning("%s: ignoring invalid action links on '%s'." % [source, feature.id])
		return
	if records.is_empty():
		return
	if not feature is WorldState.ButtonFeature:
		push_warning("%s: ignoring action links on non-button '%s'." % [source, feature.id])
		return
	for record in records:
		if not record is Dictionary:
			push_warning("%s: ignoring an invalid action link on '%s'." % [source, feature.id])
			continue
		var target_id := StringName(str(record.get("target_id", "")))
		var target := world.get_feature(target_id)
		var action: int = WorldState.FeatureAction.get(str(record.get("action", "")).to_upper(), -1)
		if not target is WorldState.DoorFeature or not action in [
			WorldState.FeatureAction.OPEN, WorldState.FeatureAction.CLOSE, WorldState.FeatureAction.TOGGLE,
		]:
			push_warning("%s: ignoring unsupported link from '%s' to '%s'." % [source, feature.id, target_id])
			continue
		var link := WorldState.FeatureActionLink.new()
		link.target_id = target_id
		link.target = target
		link.action = action
		feature.action_links.append(link)

static func _feature_id(world: WorldState, value: Variant, source: String) -> StringName:
	var id := StringName(str(value))
	if id != &"" and not world.features.has(id):
		push_warning("%s: ignoring unknown feature '%s'." % [source, id])
		return &""
	return id

static func _position(value: Variant) -> Variant:
	if not value is Array or value.size() != 2:
		return null
	for coordinate in value:
		if not (coordinate is int or coordinate is float):
			return null
		if not is_finite(coordinate) or coordinate != floor(coordinate) or coordinate < -2147483648 or coordinate > 2147483647:
			return null
	return Vector2i(int(value[0]), int(value[1]))

static func _failed(message: String) -> WorldState:
	push_error(message)
	var world := WorldState.new()
	world.load_error = message
	return world
