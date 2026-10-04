extends SceneTree

const Builder = preload("res://tools/models/model_builder.gd")
const Recipe = preload("res://tools/models/recipes/skeleton_warrior.gd")
const Marker = preload("res://tests/fixtures/models/hinged_marker.gd")
const MODEL = "res://models/skeleton_warrior/skeleton_warrior.glb"

var failures := 0
var checks := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error("MODEL TEST FAILED: " + message)

func _run() -> void:
	_check_builder()
	_check_skull_shell()
	_check_reuse()
	var model := (load(MODEL) as PackedScene).instantiate() as Node3D
	root.add_child(model)
	var rig := model.find_child("Skeleton3D", true, false) as Skeleton3D
	var mesh := model.find_child("Body", true, false) as MeshInstance3D
	var player := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	_check(rig != null and mesh != null and player != null, "Imported rig, body and player exist")
	if rig != null and mesh != null and player != null:
		_check_import(model, rig, mesh, player)
		_check_clips(model, rig, mesh, player)
	model.free()
	_check_glb()
	_check_wrapper()
	await _check_preview()
	print("Model assets: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)

func _check_builder() -> void:
	var b := Recipe.new().build()
	var again := Recipe.new().build()
	_check(b.validate().is_empty(), "Recipe validates: " + str(b.validate()))
	_check(b.vertices.size() / 3 <= 1200 and b.bone_names.size() <= 24, "Triangle and joint budgets")
	_check(b.vertices == again.vertices and b.uvs == again.uvs and b.joints == again.joints, "Deterministic geometry and binding")
	_check(b.create_atlas().get_data() == again.create_atlas().get_data(), "Deterministic atlas")
	_check(b.bone_names == again.bone_names and b.pivots == again.pivots and b.parents == again.parents, "Deterministic rig")
	for name in b.clips:
		var first: Animation = b.clips[name]
		var second: Animation = again.clips[name]
		var identical := first.length == second.length and first.get_track_count() == second.get_track_count()
		for track in range(first.get_track_count()):
			identical = identical and first.track_get_key_count(track) == second.track_get_key_count(track)
			for key in range(first.track_get_key_count(track)):
				identical = identical and first.track_get_key_value(track, key) == second.track_get_key_value(track, key)
		_check(identical, "Deterministic " + name + " animation")
	_check(not Builder.new().validate().is_empty(), "Empty recipe rejected")
	b.triangle_limit = 1
	_check(not b.validate().is_empty(), "Over-budget recipe rejected")
	b.triangle_limit = 1200
	b.joints[0] = 999
	_check(not b.validate().is_empty(), "Unknown skin joint rejected")
	b.joints[0] = again.joints[0]
	b.weights[0] = 0.5
	_check(not b.validate().is_empty(), "Non-rigid weights rejected")
	b.weights[0] = 1
	b.vertices[0] = Vector3(NAN, 0, 0)
	_check(not b.validate().is_empty(), "Non-finite geometry rejected")
	b.vertices[0] = b.vertices[1]
	_check(not b.validate().is_empty(), "Degenerate triangles rejected")

func _check_skull_shell() -> void:
	var skull := Builder.new()
	skull.add_bone("head", "", Vector3.ZERO)
	Recipe.new()._skull(skull)
	_check(skull.validate().is_empty(), "Skull faces are valid")
	var welded: Dictionary[Vector3i, int] = {}
	var edges: Dictionary[Vector2i, Vector2i] = {}
	for i in range(0, skull.vertices.size(), 3):
		var triangle: Array[int] = []
		for j in range(3):
			var key := Vector3i((skull.vertices[i + j] * 1000000).round())
			if not welded.has(key):
				welded[key] = welded.size()
			triangle.append(welded[key])
		for j in range(3):
			var a := triangle[j]
			var b := triangle[(j + 1) % 3]
			var edge := Vector2i(mini(a, b), maxi(a, b))
			edges[edge] = edges.get(edge, Vector2i.ZERO) + Vector2i(1, 1 if a < b else -1)
	var open_edges := 0
	var flipped_edges := 0
	for edge in edges.values():
		if edge.x != 2:
			open_edges += 1
		if edge.y != 0:
			flipped_edges += 1
	_check(open_edges == 0, "Skull has no open/non-manifold edges (%d)" % open_edges)
	_check(flipped_edges == 0, "Skull has consistent face winding (%d)" % flipped_edges)
	_check(welded.size() - edges.size() + skull.vertices.size() / 3 == 2, "Recessed sockets remain part of a closed skull shell")

func _check_reuse() -> void:
	var marker := Marker.new().build()
	_check(marker.validate().is_empty(), "Independent marker recipe validates")
	var scene := marker.create_scene()
	root.add_child(scene)
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var temporary := "user://model-reuse-%d.glb" % OS.get_process_id()
	_check(document.append_from_scene(scene, state) == OK, "Second recipe converts to glTF")
	_check(document.write_to_filesystem(state, temporary) == OK, "Second recipe exports")
	var imported_state := GLTFState.new()
	_check(document.append_from_file(temporary, imported_state) == OK, "Second recipe reimports")
	var imported := document.generate_scene(imported_state)
	root.add_child(imported)
	var player := imported.find_child("AnimationPlayer", true, false) as AnimationPlayer
	var rig: Skeleton3D = imported.find_children("*", "Skeleton3D", true, false)[0]
	player.play("sway")
	player.pause()
	player.seek(0.5, true)
	_check(absf(rig.get_bone_pose_rotation(rig.find_bone("hinge")).z) > 0.2, "Second recipe's hinge animates")
	imported.free()
	scene.free()
	_check(DirAccess.remove_absolute(ProjectSettings.globalize_path(temporary)) == OK, "Temporary reuse export removed")

func _check_import(model: Node3D, rig: Skeleton3D, mesh: MeshInstance3D, player: AnimationPlayer) -> void:
	_check(model.transform.is_equal_approx(Transform3D.IDENTITY), "Imported root is identity")
	_check(rig.get_bone_count() == 20, "Twenty imported bones")
	_check(mesh.skin.get_bind_count() == rig.get_bone_count(), "All skin binds retained")
	_check(mesh.mesh.get_surface_count() <= 2, "Material budget")
	var triangles := 0
	var attributes_ok := true
	for surface in range(mesh.mesh.get_surface_count()):
		var arrays := mesh.mesh.surface_get_arrays(surface)
		var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
		var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
		triangles += indices.size() / 3 if not indices.is_empty() else positions.size() / 3
		for i in range(positions.size()):
			attributes_ok = attributes_ok and positions[i].is_finite() and normals[i].is_finite() and uv[i].is_finite()
			var nonzero := 0
			var sum := 0.0
			for j in range(4):
				var index := i * 4 + j
				sum += weights[index]
				if weights[index] > 0:
					nonzero += 1
					attributes_ok = attributes_ok and bones[index] < mesh.skin.get_bind_count()
			attributes_ok = attributes_ok and nonzero == 1 and is_equal_approx(sum, 1)
		for index in indices:
			attributes_ok = attributes_ok and index >= 0 and index < positions.size()
		var mat := mesh.mesh.surface_get_material(surface) as StandardMaterial3D
		_check(mat != null and mat.albedo_texture != null, "Portable standard textured material")
		if mat != null and mat.albedo_texture != null:
			_check(mat.albedo_texture.get_width() <= 128 and mat.albedo_texture.get_height() <= 128, "Texture budget")
			_check(mat.texture_filter == BaseMaterial3D.TEXTURE_FILTER_NEAREST, "Nearest texture filtering")
	_check(attributes_ok, "Valid imported vertex attributes and rigid weights")
	_check(triangles == Recipe.new().build().vertices.size() / 3 and triangles <= 1200, "Exported triangle count matches recipe")
	_check(mesh.get_aabb().size.y > 1.7 and mesh.get_aabb().size.y < 1.95, "Reference-like source dimensions")
	for name in ["idle", "walk", "attack", "die"]:
		_check(player.has_animation(name), "Imported clip " + name)
		var animation := player.get_animation(name)
		_check(animation.get_track_count() == 40, name + " retains explicit position and rotation tracks")
		for track in range(animation.get_track_count()):
			var path := animation.track_get_path(track)
			var target := player.get_node(player.root_node).get_node_or_null(NodePath(path.get_concatenated_names()))
			_check(target == rig and rig.find_bone(path.get_subname(0)) >= 0, name + " track resolves")

func _pose(rig: Skeleton3D) -> Array[Transform3D]:
	var result: Array[Transform3D] = []
	for bone in range(rig.get_bone_count()):
		result.append(rig.get_bone_pose(bone))
	return result

func _equal_pose(a: Array[Transform3D], b: Array[Transform3D], tolerance := 0.0001) -> bool:
	for i in range(a.size()):
		if a[i].origin.distance_to(b[i].origin) > tolerance:
			return false
		if a[i].basis.get_rotation_quaternion().angle_to(b[i].basis.get_rotation_quaternion()) > 0.002:
			return false
	return true

func _skin_vertices(rig: Skeleton3D, mesh: MeshInstance3D) -> PackedVector3Array:
	rig.force_update_all_bone_transforms()
	var transforms: Array[Transform3D] = []
	for bind in range(mesh.skin.get_bind_count()):
		var bone := mesh.skin.get_bind_bone(bind)
		if bone < 0:
			bone = rig.find_bone(mesh.skin.get_bind_name(bind))
		transforms.append(rig.get_bone_global_pose(bone) * mesh.skin.get_bind_pose(bind))
	var result := PackedVector3Array()
	for surface in range(mesh.mesh.get_surface_count()):
		var arrays := mesh.mesh.surface_get_arrays(surface)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
		var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
		for i in range(vertices.size()):
			var position := Vector3.ZERO
			for j in range(4):
				if weights[i * 4 + j] > 0:
					position += (transforms[bones[i * 4 + j]] * vertices[i]) * weights[i * 4 + j]
			result.append(position)
	return result

func _check_clips(model: Node3D, rig: Skeleton3D, mesh: MeshInstance3D, player: AnimationPlayer) -> void:
	player.play("idle")
	player.pause()
	player.seek(0, true)
	var guard := _pose(rig)
	for name in ["idle", "walk", "attack", "die"]:
		var animation := player.get_animation(name)
		_check(animation.loop_mode == (Animation.LOOP_LINEAR if name in ["idle", "walk"] else Animation.LOOP_NONE), name + " loop policy")
		player.play(name)
		player.pause()
		player.seek(0, true)
		var start := _pose(rig)
		var moved := false
		var lowest := INF
		var highest := -INF
		var root_fixed := true
		var finite := true
		var contact_error := 0.0
		for frame in range(61):
			player.seek(animation.length * frame / 60.0, true)
			var positions := _skin_vertices(rig, mesh)
			var frame_min := INF
			for point in positions:
				finite = finite and point.is_finite()
				frame_min = minf(frame_min, point.y)
				highest = maxf(highest, point.y)
			lowest = minf(lowest, frame_min)
			contact_error = maxf(contact_error, absf(frame_min))
			moved = moved or not _equal_pose(start, _pose(rig))
			root_fixed = root_fixed and model.transform.is_equal_approx(Transform3D.IDENTITY) and rig.get_bone_pose(rig.find_bone("root")).is_equal_approx(Transform3D.IDENTITY)
		_check(moved and finite and root_fixed, name + " moves, remains finite and has no root motion")
		_check(lowest >= -0.025, name + " does not sink below the floor (min %.4f)" % lowest)
		_check(highest * 0.3 < 1.0, name + " fits below the dungeon ceiling")
		print("%s: min Y %.4f, max Y %.4f, contact deviation %.4f" % [name, lowest, highest, contact_error])
		if name in ["idle", "walk"]:
			_check(_equal_pose(start, _pose(rig)), name + " seamless endpoint")
			_check(contact_error < 0.035, name + " keeps a support foot near the floor")
		if name == "attack":
			_check(_equal_pose(guard, _pose(rig)), "Attack recovers to guard")
		if name == "die":
			var terminal := _pose(rig)
			player.play("die")
			player.advance(animation.length + 0.5)
			_check(not player.is_playing() and _equal_pose(terminal, _pose(rig)), "Death holds after playback finishes")
			_check(rig.get_bone_global_pose(rig.find_bone("head")).origin.y < 0.32, "Death collapses the skull to the floor")
			player.play("idle")
			player.pause()
			player.seek(0, true)
			_check(_equal_pose(guard, _pose(rig)), "Idle restores every pose channel after death")

func _check_glb() -> void:
	var file := FileAccess.open(MODEL, FileAccess.READ)
	_check(file.get_32() == 0x46546c67 and file.get_32() == 2, "glTF 2.0 binary header")
	file.get_32()
	var length := file.get_32()
	_check(file.get_32() == 0x4e4f534a, "GLB JSON chunk")
	var document: Dictionary = JSON.parse_string(file.get_buffer(length).get_string_from_utf8())
	for buffer in document.buffers:
		_check(not buffer.has("uri"), "Embedded geometry buffer")
	for image in document.images:
		_check(image.has("bufferView") and not image.has("uri"), "Embedded texture image")
	_check(document.animations.size() == 4, "Four animations in standalone GLB")

func _check_wrapper() -> void:
	var wrapper := (load("res://templates/skeleton_warrior.tscn") as PackedScene).instantiate() as Node3D
	root.add_child(wrapper)
	_check(wrapper.transform.is_equal_approx(Transform3D.IDENTITY), "Wrapper root identity")
	_check((wrapper.get_node("Visual") as Node3D).scale.is_equal_approx(Vector3.ONE * 0.3), "Scale is outside the rig")
	var mesh := wrapper.find_child("Body", true, false) as MeshInstance3D
	_check(mesh.material_override is ShaderMaterial, "Local retro material override")
	_check(mesh.extra_cull_margin >= 1, "Animated extremes have a culling margin")
	wrapper.free()

func _check_preview() -> void:
	var preview := (load("res://tools/models/model_preview.tscn") as PackedScene).instantiate()
	root.add_child(preview)
	await process_frame
	_check(preview.clips.item_count == 4, "Preview exposes four clips")
	preview._toggle_play()
	_check(not preview.player.is_playing(), "Preview pauses")
	preview._toggle_play()
	_check(preview.player.is_playing(), "Preview resumes")
	preview._replay()
	_check(is_zero_approx(preview.player.current_animation_position), "Preview replays")
	preview._set_view(90)
	_check(preview.view_angle == 90, "Preview side view")
	preview.set_dungeon_lighting(true)
	_check(preview.torch.light_energy > 0, "Preview dungeon lighting")
	preview.free()
	var static_preview := (load("res://tools/models/model_preview.tscn") as PackedScene).instantiate()
	static_preview.model_scene = load("res://models/sword.glb")
	root.add_child(static_preview)
	await process_frame
	_check(static_preview.player == null and static_preview.play_button.disabled, "Preview also supports static models")
	static_preview.free()
