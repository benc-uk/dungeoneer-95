extends RefCounted

const Builder = preload("res://tools/models/model_builder.gd")

func build() -> Builder:
	var b := Builder.new()
	b.model_name = "HingedMarker"
	b.add_bone("root", "", Vector3.ZERO)
	b.add_bone("hinge", "root", Vector3(0, 0.1, 0))
	b.box(Vector3(0, 0.05, 0), Vector3(0.3, 0.1, 0.3), "root", 7)
	b.box(Vector3(0, 0.4, 0), Vector3(0.1, 0.6, 0.1), "hinge", 4)
	b.add_clip("sway", 1.0, true, [
		{"time": 0.0},
		{"time": 0.5, "rotations": {"hinge": Vector3(0, 0, 30)}},
		{"time": 1.0},
	])
	return b
