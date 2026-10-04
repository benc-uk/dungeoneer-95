extends SceneTree
## Run against a GLB copied into a clean project, without any asset-generation scripts.

var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error("PORTABILITY TEST FAILED: " + message)

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 2:
		push_error("Usage: -- res://model.glb clip_name [clip_name ...]")
		quit(1)
		return
	var packed := load(args[0]) as PackedScene
	if packed == null:
		push_error("Cannot load model: " + args[0])
		quit(1)
		return
	var model := packed.instantiate()
	root.add_child(model)
	var rigs := model.find_children("*", "Skeleton3D", true, false)
	var players := model.find_children("*", "AnimationPlayer", true, false)
	var meshes := model.find_children("*", "MeshInstance3D", true, false)
	_check(not rigs.is_empty() and not players.is_empty() and not meshes.is_empty(), "Rig, mesh and animation player import")
	if not rigs.is_empty() and not players.is_empty():
		var rig := rigs[0] as Skeleton3D
		var player := players[0] as AnimationPlayer
		for name in args.slice(1):
			_check(player.has_animation(name), "Clip exists: " + name)
			if not player.has_animation(name):
				continue
			player.play(name)
			player.pause()
			player.seek(0, true)
			var initial: Array[Transform3D] = []
			for i in range(rig.get_bone_count()):
				initial.append(rig.get_bone_pose(i))
			player.seek(player.get_animation(name).length * 0.3, true)
			var changed := false
			for i in range(rig.get_bone_count()):
				changed = changed or not initial[i].is_equal_approx(rig.get_bone_pose(i))
			_check(changed, "Clip moves the imported rig: " + name)
	for node in meshes:
		var mesh := node as MeshInstance3D
		_check(mesh.skin != null, "Skin imported")
		for surface in range(mesh.mesh.get_surface_count()):
			var material := mesh.mesh.surface_get_material(surface) as StandardMaterial3D
			_check(material != null and material.albedo_texture != null, "Embedded standard material imported")
	model.free()
	print("Standalone model portability: %d failures" % failures)
	quit(1 if failures else 0)
