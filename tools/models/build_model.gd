extends SceneTree

const Builder = preload("res://tools/models/model_builder.gd")

func _initialize() -> void:
	_run.call_deferred()

func _fail(message: String) -> void:
	push_error(message)
	quit(1)

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 4 or args[0] != "--recipe" or args[2] != "--output":
		_fail("Usage: --recipe res://path/recipe.gd --output res://path/model.glb")
		return
	var recipe_path := args[1]
	var output := ProjectSettings.globalize_path(args[3]).simplify_path()
	if not FileAccess.file_exists(recipe_path) or output.get_extension().to_lower() != "glb":
		_fail("Recipe must exist and output must have a .glb extension")
		return
	var recipe_script := load(recipe_path) as GDScript
	if recipe_script == null or not recipe_script.can_instantiate():
		_fail("Cannot load recipe: " + recipe_path)
		return
	if not ClassDB.is_parent_class(recipe_script.get_instance_base_type(), "RefCounted"):
		_fail("Recipe must extend RefCounted")
		return
	var recipe: RefCounted = recipe_script.new()
	if not recipe.has_method("build"):
		_fail("Recipe must provide build() returning a ModelBuilder")
		return
	var builder: Variant = recipe.call("build")
	if not builder is Builder:
		_fail("Recipe build() did not return a ModelBuilder")
		return
	var problems: PackedStringArray = builder.validate()
	if not problems.is_empty():
		_fail("\n".join(problems))
		return
	var scene: Node3D = builder.create_scene()
	if scene == null:
		_fail("Recipe could not create a scene")
		return
	root.add_child(scene)
	# Exclude Godot's internal compatibility simulator from the portable asset.
	for rig in scene.find_children("*", "Skeleton3D", true, false):
		for child in rig.get_children(true):
			if child is PhysicalBoneSimulator3D and child.get_child_count() == 0:
				child.free()
	var folder := output.get_base_dir()
	var err := DirAccess.make_dir_recursive_absolute(folder)
	if err != OK:
		scene.free()
		_fail("Cannot create output directory: " + error_string(err))
		return
	var temporary := output.get_basename() + ".tmp.glb"
	var atlas_path := output.get_basename() + "_albedo.png"
	var atlas_temporary := output.get_basename() + "_albedo.tmp.png"
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	err = document.append_from_scene(scene, state)
	if err == OK:
		err = document.write_to_filesystem(state, temporary)
	if err == OK:
		err = builder.create_atlas().save_png(atlas_temporary)
	if err == OK:
		var check := GLTFState.new()
		err = GLTFDocument.new().append_from_file(temporary, check)
	if err == OK:
		err = DirAccess.rename_absolute(atlas_temporary, atlas_path)
	if err == OK:
		err = DirAccess.rename_absolute(temporary, output)
	for path in [temporary, atlas_temporary]:
		if FileAccess.file_exists(path):
			var cleanup := DirAccess.remove_absolute(path)
			if cleanup != OK:
				push_error("Cannot remove temporary file %s: %s" % [path, error_string(cleanup)])
	scene.free()
	if err != OK:
		_fail("Model export failed: " + error_string(err))
		return
	print("Exported %s: %d triangles, %d bones, %d clips, 64x32 atlas" % [
		output, builder.vertices.size() / 3, builder.bone_names.size(), builder.clips.size()])
	quit()
