extends Node3D
## Standalone inspection stage. No gameplay input actions or world state are changed.

@export var model_scene: PackedScene

var model: Node3D
var player: AnimationPlayer
var clips: OptionButton
var play_button: Button
var status: Label
var environment: Environment
var key_light: DirectionalLight3D
var torch: OmniLight3D
var focus := Vector3.ZERO
var model_height := 1.0
var view_angle := 25.0

func _ready() -> void:
	_create_stage()
	_create_controls()
	if model_scene == null:
		_report_error("Choose a Model Scene in the Inspector.")
		return
	model = model_scene.instantiate() as Node3D
	if model == null:
		_report_error("Model Scene must have a Node3D root.")
		return
	$Stage.add_child(model)
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if not players.is_empty():
		player = players[0] as AnimationPlayer
		for clip in player.get_animation_list():
			if clip != "RESET":
				clips.add_item(clip)
		player.animation_finished.connect(_animation_finished)
		for i in range(clips.item_count):
			if clips.get_item_text(i) == "idle":
				clips.select(i)
				break
	var bounds := AABB()
	var first := true
	var triangles := 0
	for child in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		var transformed: AABB = mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = transformed if first else bounds.merge(transformed)
		first = false
		for surface in range(mesh_instance.mesh.get_surface_count()):
			var arrays := mesh_instance.mesh.surface_get_arrays(surface)
			var count: int = arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX] != null and not arrays[Mesh.ARRAY_INDEX].is_empty() else arrays[Mesh.ARRAY_VERTEX].size()
			triangles += count / 3
	if first:
		_report_error("Model Scene contains no mesh.")
		return
	model_height = maxf(bounds.size.y, 0.01)
	focus = bounds.get_center()
	_set_view(25)
	status.text = "%d triangles | %.2f units tall | floor square: 1 unit" % [triangles, bounds.size.y]
	if clips.item_count > 0:
		_select_clip(clips.selected)
	else:
		play_button.disabled = true
		clips.disabled = true

func _report_error(message: String) -> void:
	push_error(message)
	status.text = message
	play_button.disabled = true

func _create_stage() -> void:
	environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("bfcddd")
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)
	key_light = DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-38, -28, 0)
	add_child(key_light)
	torch = OmniLight3D.new()
	torch.position = Vector3(-0.4, 0.55, 0.65)
	torch.light_color = Color("ffb965")
	torch.omni_range = 4.0
	add_child(torch)
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(12, 12)
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("343b43")
	floor_material.roughness = 1.0
	var floor_node := MeshInstance3D.new()
	floor_node.mesh = floor_mesh
	floor_node.material_override = floor_material
	floor_node.position.y = -0.003
	add_child(floor_node)
	var grid_material := StandardMaterial3D.new()
	grid_material.albedo_color = Color("69757a")
	grid_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for x_edge in [true, false]:
		for side in [-0.5, 0.5]:
			var line := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(0.005, 0.002, 1) if x_edge else Vector3(1, 0.002, 0.005)
			line.mesh = box
			line.material_override = grid_material
			line.position = Vector3(side, 0, 0) if x_edge else Vector3(0, 0, side)
			add_child(line)
	set_dungeon_lighting(false)

func _create_controls() -> void:
	var panel := VBoxContainer.new()
	panel.position = Vector2(5, 4)
	panel.add_theme_constant_override("separation", 2)
	panel.theme = Theme.new()
	panel.theme.default_font_size = 11
	$UI.add_child(panel)
	var animation_row := HBoxContainer.new()
	panel.add_child(animation_row)
	clips = OptionButton.new()
	clips.custom_minimum_size.x = 85
	clips.item_selected.connect(_select_clip)
	animation_row.add_child(clips)
	play_button = _button(animation_row, "Pause", _toggle_play)
	_button(animation_row, "Replay", _replay)
	var lighting := _button(animation_row, "Dungeon", func(): pass)
	lighting.toggle_mode = true
	lighting.toggled.connect(set_dungeon_lighting)
	var output := _button(animation_row, "PS1", func(): pass)
	output.toggle_mode = true
	output.button_pressed = true
	output.toggled.connect(func(enabled: bool): $PostProcess.visible = enabled)
	var views := HBoxContainer.new()
	panel.add_child(views)
	_button(views, "Front", _set_view.bind(0))
	_button(views, "Side", _set_view.bind(90))
	_button(views, "Rear", _set_view.bind(180))
	_button(views, "3/4", _set_view.bind(25))
	status = Label.new()
	status.position = Vector2(5, 223)
	status.add_theme_font_size_override("font_size", 10)
	$UI.add_child(status)

func _button(row: HBoxContainer, text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.pressed.connect(action)
	row.add_child(button)
	return button

func _select_clip(index: int) -> void:
	if player == null or index < 0:
		return
	player.play(clips.get_item_text(index))
	player.advance(0)
	play_button.text = "Pause"

func _toggle_play() -> void:
	if player == null:
		return
	if player.is_playing():
		player.pause()
		play_button.text = "Play"
	else:
		if play_button.text == "Replay":
			_replay()
		else:
			player.play()
			play_button.text = "Pause"

func _replay() -> void:
	if player != null:
		player.stop()
		_select_clip(clips.selected)

func _animation_finished(_clip: StringName) -> void:
	play_button.text = "Replay"

func _set_view(degrees: float) -> void:
	view_angle = degrees
	var angle := deg_to_rad(degrees)
	var distance := model_height * 2.1
	var camera := $Camera as Camera3D
	camera.v_offset = model_height * 0.1
	camera.position = focus + Vector3(sin(angle) * distance, model_height * 0.14, cos(angle) * distance)
	camera.look_at(focus)

func set_dungeon_lighting(enabled: bool) -> void:
	environment.background_color = Color("10131a") if enabled else Color("252c36")
	environment.ambient_light_energy = 0.22 if enabled else 0.65
	key_light.light_energy = 0.18 if enabled else 0.75
	torch.light_energy = 0.9 if enabled else 0.0
