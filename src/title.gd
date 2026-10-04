extends Node

func _ready():
	# Debug, jump to start tomb level
	#start_new_game("tomb")
	
	find_child("NewButton").grab_focus()
	_on_music_check_button_toggled($MusicCheckButton.button_pressed)

func _on_new_button_pressed():
	print("Starting game...")
	start_new_game("test-cave")

func start_new_game(level_filename: String):
	var game_scene = load("res://game.tscn")
	var new_game = game_scene.instantiate()

	new_game.level_filename = level_filename
	
	get_tree().root.add_child.call_deferred(new_game);
	queue_free()

func _on_music_check_button_toggled(toggled_on):
	var vol: float = 0.0 if toggled_on else -80.0
	$Music.volume_db = vol
