extends RefCounted

const Builder = preload("res://tools/models/model_builder.gd")

func build() -> Builder:
	var b := Builder.new()
	b.model_name = "SkeletonWarrior"
	_rig(b)
	_body(b)
	_head(b)
	_equipment(b)
	_animations(b)
	return b

func _rig(b: Builder) -> void:
	b.add_bone("root", "", Vector3.ZERO)
	b.add_bone("pelvis", "root", Vector3(0, 0.91, 0))
	b.add_bone("torso", "pelvis", Vector3(0, 1.09, 0))
	b.add_bone("neck", "torso", Vector3(0, 1.47, -0.015))
	b.add_bone("head", "neck", Vector3(0, 1.55, 0))
	b.add_bone("jaw", "head", Vector3(0, 1.585, 0.025))
	for side in [-1.0, 1.0]:
		var suffix := "_l" if side > 0 else "_r"
		b.add_bone("clavicle" + suffix, "torso", Vector3(side * 0.04, 1.44, 0))
		b.add_bone("upper_arm" + suffix, "clavicle" + suffix, Vector3(side * 0.235, 1.43, 0))
		b.add_bone("forearm" + suffix, "upper_arm" + suffix, Vector3(side * 0.27, 1.145, 0.015))
		b.add_bone("hand" + suffix, "forearm" + suffix, Vector3(side * 0.27, 1.155, 0.255))
		b.add_bone("thigh" + suffix, "pelvis", Vector3(side * 0.115, 0.92, 0))
		b.add_bone("shin" + suffix, "thigh" + suffix, Vector3(side * 0.15, 0.49, 0.01))
		b.add_bone("foot" + suffix, "shin" + suffix, Vector3(side * 0.15, 0.075, 0))

func _body(b: Builder) -> void:
	b.tube([Vector3(0, 0.97, -0.055), Vector3(0, 1.44, -0.055)], [0.026, 0.023], "torso", 2)
	for y in [1.02, 1.1, 1.18, 1.26, 1.34]:
		b.box(Vector3(0, y, -0.05), Vector3(0.061, 0.034, 0.065), "torso")
	b.tube([Vector3(0, 1.44, -0.025), Vector3(0, 1.57, 0)], [0.026, 0.021], "neck")
	b.tube([Vector3(0, 1.1, 0.12), Vector3(0, 1.395, 0.108)], [0.019, 0.023], "torso", 1)
	for side in [-1.0, 1.0]:
		var suffix := "_l" if side > 0 else "_r"
		for i in range(4):
			var y := 1.37 - i * 0.071
			var width: float = [0.16, 0.2, 0.213, 0.198][i]
			b.tube([
				Vector3(0.02 * side, y, -0.06),
				Vector3(width * 0.8 * side, y + 0.012, -0.055),
				Vector3(width * side, y - 0.014, 0.025),
				Vector3(width * 0.75 * side, y - 0.035, 0.105),
				Vector3(0.018 * side, y - 0.027, 0.125),
			], [0.014, 0.017, 0.016, 0.014, 0.013], "torso", 0, 4, false)
		b.tube([Vector3(side * 0.02, 1.426, 0.055), Vector3(side * 0.14, 1.458, 0.02), Vector3(side * 0.235, 1.43, 0)], [0.02, 0.022, 0.025], "clavicle" + suffix)
		b.ellipsoid(Vector3(side * 0.235, 1.43, 0), Vector3(0.039, 0.04, 0.036), "upper_arm" + suffix, 1, 4)
		b.tube([Vector3(side * 0.235, 1.41, 0), Vector3(side * 0.255, 1.28, 0.008), Vector3(side * 0.27, 1.16, 0.015)], [0.025, 0.016, 0.024], "upper_arm" + suffix)
		b.tube([Vector3(side * 0.27, 1.145, 0.018), Vector3(side * 0.265, 1.15, 0.23)], [0.025, 0.018], "forearm" + suffix)
		b.tube([Vector3(side * 0.289, 1.137, 0.026), Vector3(side * 0.286, 1.147, 0.23)], [0.01, 0.009], "forearm" + suffix, 2, 3)
		b.box(Vector3(side * 0.27, 1.15, 0.26), Vector3(0.068, 0.068, 0.052), "hand" + suffix)
		b.box(Vector3(side * 0.265, 1.155, 0.294), Vector3(0.052, 0.022, 0.025), "hand" + suffix, 1)
		b.tube([Vector3(side * 0.115, 0.91, 0), Vector3(side * 0.135, 0.69, 0.003), Vector3(side * 0.15, 0.505, 0.01)], [0.029, 0.018, 0.029], "thigh" + suffix)
		b.ellipsoid(Vector3(side * 0.15, 0.49, 0.015), Vector3(0.031, 0.025, 0.03), "shin" + suffix, 1, 4)
		b.tube([Vector3(side * 0.15, 0.464, 0.007), Vector3(side * 0.15, 0.092, 0)], [0.024, 0.015], "shin" + suffix)
		b.tube([Vector3(side * 0.175, 0.455, 0), Vector3(side * 0.17, 0.1, -0.009)], [0.009, 0.008], "shin" + suffix, 2, 3)
		b.box(Vector3(side * 0.15, 0.035, 0.05), Vector3(0.077, 0.07, 0.16), "foot" + suffix)
		b.box(Vector3(side * 0.15, 0.021, 0.151), Vector3(0.1, 0.042, 0.07), "foot" + suffix, 1)
	b.tube([
		Vector3(0, 0.855, 0.09), Vector3(-0.15, 0.935, 0.065),
		Vector3(-0.16, 1.01, -0.045), Vector3(0, 0.965, -0.075),
		Vector3(0.16, 1.01, -0.045), Vector3(0.15, 0.935, 0.065),
		Vector3(0, 0.855, 0.09),
	], [0.025, 0.034, 0.034, 0.028, 0.034, 0.034, 0.025], "pelvis", 0, 4, false)

func _head(b: Builder) -> void:
	_skull(b)
	b.tube([Vector3(-0.073, 1.607, 0.021), Vector3(-0.06, 1.552, 0.086), Vector3(0, 1.544, 0.106), Vector3(0.06, 1.552, 0.086), Vector3(0.073, 1.607, 0.021)], [0.012, 0.016, 0.018, 0.016, 0.012], "jaw", 0, 4)
	# Tooth markings sit just outside the closed upper-jaw surface.
	for x in [-0.025, 0.0, 0.025]:
		b.face([Vector3(x - 0.003, 1.573, 0.1305), Vector3(x - 0.003, 1.587, 0.1305), Vector3(x + 0.003, 1.587, 0.1305), Vector3(x + 0.003, 1.573, 0.1305)], "head", 3, Vector3.BACK)

func _skull(b: Builder) -> void:
	var lower: Array[Vector3] = []
	var upper: Array[Vector3] = []
	for i in range(8):
		var a := TAU * i / 8
		lower.append(Vector3(cos(a) * 0.105, 1.641, sin(a) * 0.086 + 0.012))
		upper.append(Vector3(cos(a) * 0.099, 1.767, sin(a) * 0.083))
	for i in range(8):
		var j := (i + 1) % 8
		if i >= 4:
			b.face([lower[i], lower[j], upper[j], upper[i]], "head", 0, Vector3(lower[i].x, 0, lower[i].z))
		b.face([upper[i], upper[j], Vector3(0, 1.815, -0.012)], "head", 1, Vector3.UP)
	var underside := Vector3(0, 1.595, 0.035)
	var bridge := Vector3(0, 1.705, 0.11)
	var nose_top := Vector3(0, 1.646, 0.149)
	b.face([lower[4], lower[5], lower[6], lower[7], lower[0], underside], "head", 2, Vector3.DOWN)
	for side in [-1.0, 1.0]:
		var temple := lower[0 if side > 0 else 4]
		var crown_side := upper[0 if side > 0 else 4]
		var crown_front := upper[1 if side > 0 else 3]
		var brow := Vector3(side * 0.103, 1.695, 0.087)
		var cheek := Vector3(side * 0.074, 1.598, 0.064)
		var maxilla := Vector3(side * 0.043, 1.5975, 0.13)
		var teeth := Vector3(side * 0.043, 1.573, 0.13)
		var nose_side := Vector3(side * 0.02, 1.613, 0.13)
		var socket: Array[Vector3] = [
			Vector3(side * 0.017, 1.682, 0.112),
			Vector3(side * 0.073, 1.694, 0.102),
			Vector3(side * 0.097, 1.669, 0.097),
			Vector3(side * 0.071, 1.636, 0.11),
			Vector3(side * 0.025, 1.643, 0.125),
		]
		var recess := Vector3(side * 0.054, 1.662, 0.06)
		for i in range(socket.size()):
			b.face([socket[i], socket[(i + 1) % socket.size()], recess], "head", 3, Vector3.BACK)
		b.face([crown_side, crown_front, brow], "head", 0, Vector3.BACK)
		b.face([crown_front, upper[2], bridge], "head", 0, Vector3.BACK)
		b.face([crown_front, bridge, brow], "head", 0, Vector3.BACK)
		b.face([crown_side, temple, socket[2], brow], "head", 0, Vector3(side, 0, 0))
		_skull_front(b, [bridge, brow, socket[2], socket[1], socket[0]], 1)
		b.face([socket[2], temple, cheek, socket[3]], "head", 0, Vector3(side, 0, 1))
		_skull_front(b, [socket[4], socket[3], cheek, maxilla, nose_side], 1)
		_skull_front(b, [bridge, socket[0], socket[4], nose_side, nose_top], 0)
		b.face([temple, cheek, underside], "head", 2, Vector3(side, -1, 0))
		b.face([cheek, maxilla, teeth], "head", 0, Vector3(side, 0, 0))
		b.face([cheek, teeth, underside], "head", 2, Vector3.DOWN)
	var nose_left := Vector3(-0.02, 1.613, 0.13)
	var nose_right := Vector3(0.02, 1.613, 0.13)
	var nose_recess := Vector3(0, 1.628, 0.105)
	b.face([nose_top, nose_left, nose_recess], "head", 3, Vector3.BACK)
	b.face([nose_left, nose_right, nose_recess], "head", 3, Vector3.BACK)
	b.face([nose_right, nose_top, nose_recess], "head", 3, Vector3.BACK)
	var maxilla_left := Vector3(-0.043, 1.5975, 0.13)
	var maxilla_right := Vector3(0.043, 1.5975, 0.13)
	var teeth_left := Vector3(-0.043, 1.573, 0.13)
	var teeth_right := Vector3(0.043, 1.573, 0.13)
	b.face([nose_left, nose_right, maxilla_right, maxilla_left], "head", 0, Vector3.BACK)
	b.face([maxilla_left, maxilla_right, teeth_right, teeth_left], "head", 0, Vector3.BACK)
	b.face([teeth_left, teeth_right, underside], "head", 2, Vector3.DOWN)

func _skull_front(b: Builder, points: Array[Vector3], swatch: int) -> void:
	# Brow and cheek outlines are concave, so a triangle fan would overlap them.
	var outline := PackedVector2Array()
	for point in points:
		outline.append(Vector2(point.x, point.y))
	var indices := Geometry2D.triangulate_polygon(outline)
	if indices.size() != (points.size() - 2) * 3:
		b.errors.append("Cannot triangulate skull face")
		return
	for i in range(0, indices.size(), 3):
		b.face([points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]], "head", swatch, Vector3.BACK)

func _equipment(b: Builder) -> void:
	var centre := Vector3(0.36, 1.22, 0.33)
	var radius := 0.222
	for i in range(10):
		var a := TAU * i / 10
		var c := TAU * (i + 1) / 10
		var u := Vector3(cos(a), sin(a), 0)
		var v := Vector3(cos(c), sin(c), 0)
		b.face([centre + Vector3(0, 0, 0.018), centre + u * (radius - 0.023), centre + v * (radius - 0.023)], "hand_l", 6, Vector3.BACK)
		b.face([centre + u * (radius - 0.023), centre + u * radius, centre + v * radius, centre + v * (radius - 0.023)], "hand_l", 5, Vector3.BACK)
		b.face([centre + u * radius, centre + u * radius - Vector3(0, 0, 0.032), centre + v * radius - Vector3(0, 0, 0.032), centre + v * radius], "hand_l", 7, u + v)
		b.face([centre - Vector3(0, 0, 0.032), centre + u * radius - Vector3(0, 0, 0.032), centre + v * radius - Vector3(0, 0, 0.032)], "hand_l", 6, Vector3.FORWARD)
	b.ellipsoid(centre + Vector3(0, 0, 0.024), Vector3(0.049, 0.049, 0.032), "hand_l", 5, 4)
	b.box(Vector3(0.305, 1.17, 0.294), Vector3(0.115, 0.025, 0.025), "hand_l", 7)
	b.tube([Vector3(-0.27, 1.077, 0.277), Vector3(-0.27, 1.235, 0.277)], [0.018, 0.018], "hand_r", 6, 5)
	b.ellipsoid(Vector3(-0.27, 1.07, 0.277), Vector3(0.027, 0.029, 0.027), "hand_r", 5, 4)
	b.box(Vector3(-0.27, 1.237, 0.277), Vector3(0.155, 0.026, 0.036), "hand_r", 5)
	var left := Vector3(-0.305, 1.26, 0.277)
	var right := Vector3(-0.235, 1.26, 0.277)
	var tip := Vector3(-0.27, 1.795, 0.277)
	var ridge := Vector3(-0.27, 1.27, 0.292)
	var back := Vector3(-0.27, 1.27, 0.262)
	b.face([left, ridge, tip], "hand_r", 4, Vector3.BACK)
	b.face([ridge, right, tip], "hand_r", 7, Vector3.BACK)
	b.face([left, tip, back], "hand_r", 7, Vector3.FORWARD)
	b.face([back, tip, right], "hand_r", 4, Vector3.FORWARD)
	b.face([left, back, right, ridge], "hand_r", 7, Vector3.DOWN)

func _pose(time: float, rotations: Dictionary = {}, offset := Vector3.ZERO) -> Dictionary:
	return {"time": time, "rotations": rotations, "offsets": {"pelvis": offset}}

func _animations(b: Builder) -> void:
	var idle: Array[Dictionary] = [
		_pose(0), _pose(0.6, {"torso": Vector3(1, -3, 1), "head": Vector3(-2, 5, -1), "forearm_l": Vector3(-3, 0, 0)}, Vector3(0.008, -0.005, 0)),
		_pose(1.2, {"torso": Vector3(0, 1, -1), "head": Vector3(1, -3, 0), "jaw": Vector3(3, 0, 0)}, Vector3(-0.008, 0, 0)),
		_pose(1.8, {"torso": Vector3(-1, 2, 0), "head": Vector3(0, -5, 1), "forearm_r": Vector3(-2, 0, 0)}),
		_pose(2.4),
	]
	for frame in idle:
		_ground_frame(b, frame)
	b.add_clip("idle", 2.4, true, idle)
	var walk: Array[Dictionary] = []
	for i in range(9):
		var phase := TAU * i / 8
		var left := sin(phase)
		var right := -left
		var rotations := {
			"thigh_l": Vector3(-left * 26, 0, 0), "thigh_r": Vector3(-right * 26, 0, 0),
			"shin_l": Vector3(maxf(left, 0) * 42, 0, 0), "shin_r": Vector3(maxf(right, 0) * 42, 0, 0),
			"foot_l": Vector3(left * 26 - maxf(left, 0) * 42, 0, 0),
			"foot_r": Vector3(right * 26 - maxf(right, 0) * 42, 0, 0),
			"pelvis": Vector3(0, left * 4, 0), "torso": Vector3(0, -left * 6, left * 2),
			"upper_arm_l": Vector3(right * 5, 0, 0), "upper_arm_r": Vector3(left * 7, 0, 0),
			"head": Vector3(0, left * 2, 0),
		}
		var frame := _pose(i * 0.15, rotations)
		_ground_frame(b, frame, "foot_r" if left > 0 else "foot_l")
		walk.append(frame)
	walk = _grounded_inbetweens(b, walk)
	b.add_clip("walk", 1.2, true, walk)
	var attack: Array[Dictionary] = [
		_pose(0),
		_pose(0.3, {"torso": Vector3(-6, -19, 4), "upper_arm_r": Vector3(-85, 10, 22), "forearm_r": Vector3(-32, 0, 0), "head": Vector3(0, 15, 0), "forearm_l": Vector3(-9, -8, 0)}, Vector3(0, -0.024, -0.015)),
		_pose(0.46, {"torso": Vector3(9, 18, -6), "upper_arm_r": Vector3(-35, -14, -15), "forearm_r": Vector3(62, -10, 0), "head": Vector3(-4, -10, 0)}, Vector3(0, -0.025, 0.045)),
		_pose(0.65, {"torso": Vector3(12, 25, -6), "upper_arm_r": Vector3(15, -15, -20), "forearm_r": Vector3(20, -14, 0)}, Vector3(0, -0.028, 0.028)),
		_pose(0.95, {"torso": Vector3(2, 4, 0), "upper_arm_r": Vector3(-5, 0, 0)}),
		_pose(1.25),
	]
	for frame in attack:
		_ground_frame(b, frame)
	b.add_clip("attack", 1.25, false, attack)
	var death: Array[Dictionary] = [
		_pose(0),
		_pose(0.18, {"torso": Vector3(-18, -7, 0), "head": Vector3(-20, 0, 0), "jaw": Vector3(12, 0, 0), "upper_arm_l": Vector3(12, 0, -13), "upper_arm_r": Vector3(15, 0, 25)}, Vector3(0, -0.04, -0.035)),
		_pose(0.5, {"pelvis": Vector3(-32, 0, 4), "torso": Vector3(-12, 0, 0), "thigh_l": Vector3(22, 0, 5), "thigh_r": Vector3(12, 0, -8), "shin_l": Vector3(-50, 0, 0), "shin_r": Vector3(-42, 0, 0), "upper_arm_r": Vector3(-10, 0, 55), "upper_arm_l": Vector3(0, 0, -30), "forearm_l": Vector3(-45, 0, 0)}, Vector3(0.015, -0.25, -0.12)),
		_pose(0.95, _dead_pose(-77), Vector3(0, -0.74, -0.32)),
		_pose(1.15, _dead_pose(-88), Vector3(0, -0.77, -0.32)),
		_pose(1.4, _dead_pose(-84), Vector3(0, -0.775, -0.32)),
		_pose(1.8, _dead_pose(-84), Vector3(0, -0.775, -0.32)),
	]
	death = _grounded_inbetweens(b, death)
	b.add_clip("die", 1.8, false, death)

func _grounded_inbetweens(b: Builder, frames: Array[Dictionary]) -> Array[Dictionary]:
	# Sample the authored rotation curves offline, then bake floor contact.
	var result: Array[Dictionary] = []
	for i in range(frames.size() - 1):
		var start: Dictionary = frames[i]
		var end: Dictionary = frames[i + 1]
		var steps := maxi(1, ceili((end.time - start.time) * 30))
		for step in range(steps):
			var amount := float(step) / steps
			var rotations := {}
			for bone in b.bone_names:
				var a := Quaternion.from_euler(start.rotations.get(bone, Vector3.ZERO) * PI / 180.0)
				var c := Quaternion.from_euler(end.rotations.get(bone, Vector3.ZERO) * PI / 180.0)
				rotations[bone] = a.slerp(c, amount).get_euler() * 180.0 / PI
			var offset: Vector3 = start.offsets.pelvis.lerp(end.offsets.pelvis, amount)
			var frame := _pose(lerpf(start.time, end.time, amount), rotations, offset)
			_ground_frame(b, frame)
			result.append(frame)
	var last: Dictionary = frames[-1].duplicate(true)
	_ground_frame(b, last)
	result.append(last)
	return result

func _ground_frame(b: Builder, frame: Dictionary, support_bone := "") -> void:
	var positions := b.posed_vertices(frame)
	var minimum := INF
	for i in range(positions.size()):
		if support_bone.is_empty() or b.bone_names[b.joints[i * 4]] == support_bone:
			minimum = minf(minimum, positions[i].y)
	# Bake contact correction into the pelvis track; the delivered asset needs no IK.
	frame.offsets.pelvis.y -= minimum

func _dead_pose(tilt: float) -> Dictionary:
	return {
		"pelvis": Vector3(tilt, 0, 0), "torso": Vector3(-4, 0, 0),
		"head": Vector3(5, -16, 0), "jaw": Vector3(14, 0, 0),
		"thigh_l": Vector3(2, 0, 14), "thigh_r": Vector3(0, 0, -9),
		"shin_l": Vector3(-5, 0, 0), "shin_r": Vector3(-3, 0, 0),
		"foot_l": Vector3(15, 0, 0), "foot_r": Vector3(10, 0, 0),
		"upper_arm_r": Vector3(0, 0, -55), "forearm_r": Vector3(90, 0, 0), "hand_r": Vector3(-90, 0, 0),
		"upper_arm_l": Vector3(0, 0, 50), "forearm_l": Vector3(90, 0, 0), "hand_l": Vector3(-90, 0, 0),
	}
