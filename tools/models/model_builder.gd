extends RefCounted
## Small rigid-skinned mesh builder. Recipe geometry is in model-space, Y-up, +Z forward.

var model_name := "Model"
var triangle_limit := 1200
var bone_limit := 24
var errors: PackedStringArray = []
var bone_names: Array[String] = []
var parents: Array[int] = []
var pivots: Array[Vector3] = []
var vertices := PackedVector3Array()
var normals := PackedVector3Array()
var uvs := PackedVector2Array()
var joints := PackedInt32Array()
var weights := PackedFloat32Array()
var clips: Dictionary[String, Animation] = {}
var palette: Array[Color] = [
	Color("c8bc99"), Color("e0d2ab"), Color("9e9172"), Color("292720"),
	Color("929c9c"), Color("9a7b46"), Color("67523a"), Color("3d4449"),
]

func add_bone(bone_name: String, parent_name: String, pivot: Vector3) -> int:
	if bone_names.has(bone_name) or not pivot.is_finite():
		errors.append("Invalid or duplicate bone: " + bone_name)
	var parent := bone_names.find(parent_name)
	if not parent_name.is_empty() and parent < 0:
		errors.append("Parent must precede child: " + bone_name)
	bone_names.append(bone_name)
	parents.append(parent)
	pivots.append(pivot)
	return bone_names.size() - 1

func face(points: Array[Vector3], bone: String, swatch: int, outward: Vector3) -> void:
	var joint := bone_names.find(bone)
	if joint < 0 or swatch < 0 or swatch >= palette.size() or points.size() < 3:
		errors.append("Invalid face bone, swatch or polygon: " + bone)
		return
	for i in range(1, points.size() - 1):
		var a := points[0]
		var b := points[i]
		var c := points[i + 1]
		# Godot uses clockwise front faces.
		if (c - a).cross(b - a).dot(outward) < 0:
			var swap := b
			b = c
			c = swap
		var normal := (c - a).cross(b - a).normalized()
		var tile := Vector2(swatch % 4, swatch / 4)
		var corners := [Vector2(0.1, 0.9), Vector2(0.1, 0.1), Vector2(0.9, 0.1)]
		var triangle := [a, b, c]
		for j in range(3):
			vertices.append(triangle[j])
			normals.append(normal)
			uvs.append((tile + corners[j]) / Vector2(4, 2))
			joints.append_array(PackedInt32Array([joint, 0, 0, 0]))
			weights.append_array(PackedFloat32Array([1, 0, 0, 0]))

func tube(path: Array[Vector3], radii: Array[float], bone: String, swatch := 0, sides := 4, caps := true) -> void:
	if path.size() < 2 or path.size() != radii.size() or sides < 3:
		errors.append("Invalid tube path")
		return
	var rings: Array = []
	for i in range(path.size()):
		var tangent := (path[mini(i + 1, path.size() - 1)] - path[maxi(0, i - 1)]).normalized()
		var axis := Vector3.RIGHT if absf(tangent.dot(Vector3.RIGHT)) < 0.95 else Vector3.UP
		var u := tangent.cross(axis).normalized()
		var v := tangent.cross(u).normalized()
		var ring: Array[Vector3] = []
		for j in range(sides):
			var angle := TAU * j / sides + PI / 4.0
			ring.append(path[i] + radii[i] * (u * cos(angle) + v * sin(angle)))
		rings.append(ring)
	for i in range(path.size() - 1):
		for j in range(sides):
			var k := (j + 1) % sides
			var outward: Vector3 = rings[i][j] + rings[i][k] - path[i] * 2
			face([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]], bone, swatch, outward)
	if caps:
		face(rings[0], bone, swatch, path[0] - path[1])
		face(rings[-1], bone, swatch, path[-1] - path[-2])

func box(centre: Vector3, size: Vector3, bone: String, swatch := 0) -> void:
	var h := size * 0.5
	var points: Array[Vector3] = []
	for z in [-1, 1]:
		for y in [-1, 1]:
			for x in [-1, 1]:
				points.append(centre + h * Vector3(x, y, z))
	for indices in [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]:
		var polygon: Array[Vector3] = []
		var midpoint := Vector3.ZERO
		for index in indices:
			polygon.append(points[index])
			midpoint += points[index]
		face(polygon, bone, swatch, midpoint / 4 - centre)

func ellipsoid(centre: Vector3, size: Vector3, bone: String, swatch := 0, sides := 6) -> void:
	var rings: Array = []
	for latitude in [-PI / 4, PI / 4]:
		var ring: Array[Vector3] = []
		for i in range(sides):
			var a := TAU * i / sides
			ring.append(centre + size * Vector3(cos(a) * cos(latitude), sin(latitude), sin(a) * cos(latitude)))
		rings.append(ring)
	for i in range(sides):
		var j := (i + 1) % sides
		var outward: Vector3 = rings[0][i] - centre
		outward.y = 0
		face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], bone, swatch, outward)
		face([centre - Vector3(0, size.y, 0), rings[0][j], rings[0][i]], bone, swatch, Vector3.DOWN)
		face([centre + Vector3(0, size.y, 0), rings[1][i], rings[1][j]], bone, swatch, Vector3.UP)

func add_clip(clip_name: String, duration: float, looping: bool, frames: Array[Dictionary]) -> void:
	if clips.has(clip_name) or duration <= 0 or frames.size() < 2:
		errors.append("Invalid animation: " + clip_name)
		return
	if not is_zero_approx(frames[0].time) or not is_equal_approx(frames[-1].time, duration):
		errors.append("Animation must key both endpoints: " + clip_name)
	for frame in frames:
		for channel in ["rotations", "offsets"]:
			for bone in frame.get(channel, {}):
				if not bone_names.has(bone):
					errors.append("Unknown animation bone: " + bone)
	var animation := Animation.new()
	animation.length = duration
	animation.loop_mode = Animation.LOOP_LINEAR if looping else Animation.LOOP_NONE
	for i in range(bone_names.size()):
		var position_track := animation.add_track(Animation.TYPE_POSITION_3D)
		var rotation_track := animation.add_track(Animation.TYPE_ROTATION_3D)
		var path := NodePath("Rig:" + bone_names[i])
		animation.track_set_path(position_track, path)
		animation.track_set_path(rotation_track, path)
		var rest := pivots[i] - (pivots[parents[i]] if parents[i] >= 0 else Vector3.ZERO)
		var previous_time := -1.0
		for frame in frames:
			var time: float = frame.time
			if not is_finite(time) or time <= previous_time or time > duration:
				errors.append("Unordered or invalid animation key: " + clip_name)
			previous_time = time
			var angles: Vector3 = frame.get("rotations", {}).get(bone_names[i], Vector3.ZERO)
			var offset: Vector3 = frame.get("offsets", {}).get(bone_names[i], Vector3.ZERO)
			if not angles.is_finite() or not offset.is_finite():
				errors.append("Non-finite animation pose: " + clip_name)
			animation.position_track_insert_key(position_track, time, rest + offset)
			animation.rotation_track_insert_key(rotation_track, time, Quaternion.from_euler(angles * PI / 180.0))
	clips[clip_name] = animation

func posed_vertices(frame: Dictionary) -> PackedVector3Array:
	var transforms: Array[Transform3D] = []
	for i in range(bone_names.size()):
		var rest := pivots[i] - (pivots[parents[i]] if parents[i] >= 0 else Vector3.ZERO)
		var angles: Vector3 = frame.get("rotations", {}).get(bone_names[i], Vector3.ZERO)
		var offset: Vector3 = frame.get("offsets", {}).get(bone_names[i], Vector3.ZERO)
		var local := Transform3D(Basis.from_euler(angles * PI / 180.0), rest + offset)
		transforms.append(transforms[parents[i]] * local if parents[i] >= 0 else local)
	var result := PackedVector3Array()
	result.resize(vertices.size())
	for i in range(vertices.size()):
		var joint := joints[i * 4]
		result[i] = transforms[joint] * (vertices[i] - pivots[joint])
	return result

func validate() -> PackedStringArray:
	var result := errors.duplicate()
	if vertices.is_empty() or vertices.size() % 3 != 0 or vertices.size() / 3 > triangle_limit:
		result.append("Geometry is empty, incomplete or exceeds %d triangles" % triangle_limit)
	if bone_names.is_empty() or bone_names.size() > bone_limit:
		result.append("Rig must have 1 to %d bones" % bone_limit)
	if palette.size() != 8:
		result.append("Atlas requires exactly eight colour swatches")
	if normals.size() != vertices.size() or uvs.size() != vertices.size() or joints.size() != vertices.size() * 4 or weights.size() != vertices.size() * 4:
		result.append("Vertex attribute counts differ")
		return result
	if parents.size() != bone_names.size() or pivots.size() != bone_names.size():
		result.append("Bone attribute counts differ")
		return result
	for i in range(bone_names.size()):
		if parents[i] >= i or parents[i] < -1 or not pivots[i].is_finite():
			result.append("Invalid bone hierarchy or pivot")
			break
	for i in range(vertices.size()):
		if not vertices[i].is_finite() or not normals[i].is_finite() or normals[i].length_squared() < 0.9:
			result.append("Non-finite or degenerate triangle at vertex %d" % i)
			break
		if not uvs[i].is_finite() or uvs[i].x < 0 or uvs[i].x > 1 or uvs[i].y < 0 or uvs[i].y > 1:
			result.append("Invalid texture coordinate")
			break
		if joints[i * 4] < 0 or joints[i * 4] >= bone_names.size():
			result.append("Vertex references an unknown bone")
			break
		if weights[i * 4] != 1 or weights[i * 4 + 1] != 0 or weights[i * 4 + 2] != 0 or weights[i * 4 + 3] != 0:
			result.append("Each vertex must have exactly one rigid weight")
			break
	for i in range(0, vertices.size() - 2, 3):
		if (vertices[i + 1] - vertices[i]).cross(vertices[i + 2] - vertices[i]).length_squared() < 0.000000000001:
			result.append("Degenerate triangle %d" % (i / 3))
			break
	return result

func create_atlas() -> Image:
	var image := Image.create(64, 32, false, Image.FORMAT_RGBA8)
	for y in range(32):
		for x in range(64):
			var tile := (y / 16) * 4 + x / 16
			var colour := palette[tile]
			var speckle := (x * 37 + y * 17 + x * y * 3) % 23
			if speckle == 0:
				colour = colour.darkened(0.12)
			elif speckle == 1:
				colour = colour.lightened(0.08)
			image.set_pixel(x, y, colour)
	return image

func create_scene() -> Node3D:
	var problems := validate()
	if not problems.is_empty():
		for problem in problems:
			push_error(problem)
		return null
	var scene := Node3D.new()
	scene.name = model_name
	var rig := Skeleton3D.new()
	rig.name = "Rig"
	rig.animate_physical_bones = false
	scene.add_child(rig)
	rig.owner = scene
	for i in range(bone_names.size()):
		rig.add_bone(bone_names[i])
		if parents[i] >= 0:
			rig.set_bone_parent(i, parents[i])
		var local := pivots[i] - (pivots[parents[i]] if parents[i] >= 0 else Vector3.ZERO)
		rig.set_bone_rest(i, Transform3D(Basis.IDENTITY, local))
	rig.reset_bone_poses()
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_BONES] = joints
	arrays[Mesh.ARRAY_WEIGHTS] = weights
	var mesh := ArrayMesh.new()
	mesh.resource_name = model_name + "Mesh"
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := StandardMaterial3D.new()
	material.resource_name = model_name + "Palette"
	material.albedo_texture = ImageTexture.create_from_image(create_atlas())
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.roughness = 1.0
	material.metallic = 0.0
	material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	mesh.surface_set_material(0, material)
	var visual := MeshInstance3D.new()
	visual.name = "Body"
	visual.mesh = mesh
	rig.add_child(visual)
	visual.owner = scene
	visual.skeleton = NodePath("..")
	visual.skin = rig.create_skin_from_rest_transforms()
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	scene.add_child(player)
	player.owner = scene
	var library := AnimationLibrary.new()
	for clip in clips:
		library.add_animation(clip, clips[clip])
	player.add_animation_library("", library)
	return scene
