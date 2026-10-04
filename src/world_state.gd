class_name WorldState

var loaded_ok: bool = false
var load_error: String = "No level has been loaded."
var level_name = ""

var player_start: Vector2i = Vector2i.ZERO
var player_start_face = -1
var cells: Dictionary[Vector2i, Cell] = {}
var features: Dictionary[StringName, Feature] = {}
var monsters: Dictionary[StringName, MonsterGroup] = {}

enum CellType { FLOOR, WALL }
enum FeatureType { DOOR, BUTTON, SWITCH, FLOORPLATE, PIT_TRAP }

enum FeatureAction {
	OPEN,
	CLOSE,
	TOGGLE,
	ACTIVATE,
	DEACTIVATE,
	TRIGGER,
	RESET,
}

class FeatureActionLink:
	var target_id: StringName
	var target: Feature
	var action: FeatureAction
	
class Feature:
	extends RefCounted
	signal state_changed
	signal activated
	var id: StringName
	var action_links: Array[FeatureActionLink] = []
	
	func blocks_move() -> bool:
		return false
		
	func _init(i: StringName) -> void:
		id = i

	func apply_action(action: FeatureAction) -> void:
		print("Im ", self.id, " applied this action: ", FeatureAction.find_key(action))
		push_error("Feature '%s' does not support action %s." % [id, action])
		
	func interact():
		for action_link in action_links:

			if action_link.target == null:
				push_warning("Feature '%s' targets unknown feature '%s'; ignoring link." % [id, action_link.target_id])
				continue

			action_link.target.apply_action(action_link.action)
		
class TorchFeature:
	extends Feature

class PillarFeature:
	extends Feature
	
class ButtonFeature:
	extends Feature
	
	func interact():
		activated.emit()
		super()
	
class DoorFeature:
	extends Feature
	
	enum State { CLOSED, OPEN, LOCKED }
	enum Axis { NORTH_SOUTH, EAST_WEST }
	var state: State = State.CLOSED
	var axis: Axis = Axis.NORTH_SOUTH
	
	func apply_action(action: FeatureAction) -> void:
		match action:
			FeatureAction.OPEN: open()
			FeatureAction.CLOSE: close()
			FeatureAction.TOGGLE:
				if state == State.OPEN:
					close()
				else:
					open()
				
	func blocks_move() -> bool:
		return state != State.OPEN
		
	func open() -> void:
		if state == State.LOCKED:
			return

		if state != State.OPEN:
			state_changed.emit(State.OPEN)
			
		state = State.OPEN

	func close() -> void:
		state = State.CLOSED
		state_changed.emit(state)

class MonsterGroup:
	enum State { IDLE, DEAD }
	var mon_class: String = ""
	var count: int = 1
	var state: State = State.IDLE
	var facing: Grid.Dir
	
# ============================

class Cell:
	var type: CellType = CellType.WALL
	var wall_features: Dictionary[Grid.Dir, StringName] = {}
	var main_feature: StringName = &""
	var monster_group: StringName = &""
	var blocks_move: bool = true

	func _init(t: CellType):
		self.type = t
		self.blocks_move = true if t == CellType.WALL else false

func interact_feature(feature_id: StringName):
	var feat := features.get(feature_id) as Feature

	if feat == null:
		push_warning("Ignoring interaction with unknown feature: %s" % feature_id)
		return

	feat.interact()

func get_feature(feature_id: StringName) -> Feature:
	return features.get(feature_id)

func get_monster_group(group_id: StringName) -> MonsterGroup:
	return monsters.get(group_id)
	
func is_walkable(cell: Vector2i) -> bool:
	var c := cells.get(cell) as Cell
	if c == null: return false
	if c.blocks_move: return false
	var feat = get_feature(c.main_feature)
	if feat != null and feat.blocks_move(): return false
	return true
