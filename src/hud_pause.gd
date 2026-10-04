extends Control

func _ready() -> void:
	visibility_changed.connect(_on_visibility_changed)
	_on_visibility_changed()
	
func _on_visibility_changed() -> void:
	if is_visible_in_tree():
		find_child("ResumeBtn").grab_focus.call_deferred()
		
func _physics_process(delta: float):
	if Input.is_action_just_pressed("pause"):
		if !get_tree().paused:
			get_tree().paused = true
			show()
			return
		if get_tree().paused:
			get_tree().paused = false
			hide()
			return

func _on_resume_btn_pressed():
	get_tree().paused = false
	hide()

func _on_exit_btn_pressed():
	var scn = load("res://title.tscn")
	var title = scn.instantiate()

	get_tree().paused = false
	get_tree().root.add_child.call_deferred(title)
	get_parent().queue_free()
