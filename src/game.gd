extends Node3D

var world_state: WorldState
var level_filename = "" # Populated when starting a new game or loading a level

# Called when the node enters the scene tree for the first time.
func _ready():
	# Load and parse the level file
	world_state = WorldStateLoader.load_level(level_filename)
	
	if not world_state.loaded_ok:
		push_error("Cannot start game: level '%s' failed to load." % level_filename)
		OS.alert(world_state.load_error, "Level load failed")
		var title_scene := preload("res://title.tscn")
		var title := title_scene.instantiate()
		get_tree().root.add_child.call_deferred(title)
		queue_free()		
		return
				
	print("Building world...")
	var wall_scene = load("res://templates/map_cell.tscn")
	var door_scene = load("res://templates/map_door.tscn")
	var wall_button_scn = load("res://templates/map_button.tscn")
	var torch_scn = load("res://templates/map_torch.tscn")
	var pillar_scn = load("res://templates/map_wall_pillar.tscn")
	var monster_group_scn = load("res://templates/monster_group.tscn")
	
	for pos in world_state.cells:
		var cell = world_state.cells[pos]
		var inst = wall_scene.instantiate() as MapCell
		
		if cell.type == WorldState.CellType.FLOOR:
			inst.show_walls = false
		
		inst.position = Grid.cell_to_world(pos)
		$Map.add_child(inst)
		
		var feat
		for feat_dir in cell.wall_features:
			feat = world_state.get_feature(cell.wall_features[feat_dir])
			if feat != null && feat is WorldState.ButtonFeature:
				inst = wall_button_scn.instantiate()
				inst.position = Grid.cell_to_world(pos)
				inst.rotate_y(Grid.dir_to_angle(feat_dir))
				$Map.add_child(inst)	
				inst.bind(feat)
				
			# Create torches
			if feat != null && feat is WorldState.TorchFeature:
				inst = torch_scn.instantiate()
				inst.position = Grid.cell_to_world(pos)
				inst.rotate_y(Grid.dir_to_angle(feat_dir) - Grid.dir_to_angle(Grid.Dir.WEST))
				$Map.add_child(inst)
				
			if feat != null && feat is WorldState.PillarFeature:
				inst = pillar_scn.instantiate()
				inst.position = Grid.cell_to_world(pos)
				inst.rotate_y(Grid.dir_to_angle(feat_dir) - Grid.dir_to_angle(Grid.Dir.WEST))
				$Map.add_child(inst)				

		feat = world_state.get_feature(cell.main_feature)
		
		# Create doors
		if feat != null && feat is WorldState.DoorFeature:
			inst = door_scene.instantiate()
			inst.position = Grid.cell_to_world(pos)
			if feat.axis == WorldState.DoorFeature.Axis.EAST_WEST:
				inst.rotate_y(deg_to_rad(90))
			$Map.add_child(inst)
			inst.bind(feat)
			
		# Create monsters
		var mg = world_state.get_monster_group(cell.monster_group)
		if mg != null:
			inst = monster_group_scn.instantiate()
			inst.position = Grid.cell_to_world(pos)
			print(mg.facing)
			# Skeleton models face south (+Z) before the group rotation.
			inst.rotate_y(Grid.dir_to_angle(mg.facing))
			$Map.add_child(inst)
			

	# Instantiate player
	var player_scene = load("res://player.tscn")
	var player = player_scene.instantiate() as Node3D
	player.world_state = world_state
	player.teleport(world_state.player_start, world_state.player_start_face)
	add_child(player)
	print("Player added at: ", world_state.player_start)
