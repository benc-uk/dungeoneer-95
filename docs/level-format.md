# JSON levels (version 1)

The standalone editor in `editor` writes the same sparse cells, monsters and feature
references that `WorldState` uses. The game loads `res://levels/<name>.json`.
`WorldStateLoader` reads the file and constructs the state; `WorldState`
itself contains no JSON loading code. This is an authored-level format,
not a saved-game format.

```json
{
  "schema_version": 1,
  "name": "Example",
  "player_start": [0, 0],
  "player_start_face": "north",
  "cells": [
    { "pos": [0, 0], "type": "floor" },
    { "pos": [0, 1], "type": "floor", "main_feature": "door_1", "monster_group": "monster_1" }
  ],
  "features": [
    {
      "id": "door_1",
      "type": "door",
      "state": "closed",
      "axis": "north_south"
    }
  ],
  "monsters": [
    {
      "id": "monster_1",
      "mon_class": "skeleton_warrior",
      "count": 2,
      "state": "idle",
      "facing": "north"
    }
  ]
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `schema_version` | Required integer, currently `1`. |
| `name` | Required non-blank level name. Independent of the filename. |
| `player_start` | Required `[x, z]`, or `null` in an unfinished draft. |
| `player_start_face` | Required `north`, `east`, `south` or `west`. |
| `cells` | Required array of explicitly authored cells. |
| `features` | Required array of feature definitions with unique non-blank `id` strings. |
| `monsters` | Optional array of monster group definitions with unique non-blank `id` strings. Omitted or `[]` means no groups. |

Coordinates must be signed 32-bit integers. In Godot, `[x, z]` becomes
`Vector2i(x, z)` (the vector's second component is named `y`).
North is negative Z, east is positive X. Negative coordinates are supported.
Missing cells are void: not rendered and not walkable, **not implicit walls**.
There is no required bounding rectangle, width or height.

Every cell has `pos` and `type` (`floor` or `wall`). Optional fields:

- `main_feature`: a non-blank feature ID. Omitted means no centre feature.
- `wall_features`: an object mapping cardinal direction names to feature
  IDs. Omitted or `{}` means no wall-mounted features.
- `monster_group`: a non-blank monster group ID. Omitted means no group.
  This is separate from `main_feature` and `wall_features`.

For example, `"wall_features": {"east": "button_1"}` attaches a button to the
east edge of the selected **floor cell**. The supporting wall is the separate
cell immediately east. This matches Player's current-cell interaction lookup.
Each slot holds one feature. The editor expects each feature to have exactly
one placement, and only offers feature placement on floor cells.

## Feature definitions

| `type` | Allowed placement | Additional fields |
| --- | --- | --- |
| `door` | Centre (`main_feature`) | Required `state`: `closed`, `open`, `locked`; required `axis`: `north_south`, `east_west`. |
| `button` | Cardinal wall slot | Optional `action_links` array. |
| `torch` | Cardinal wall slot | No additional properties required. |
| `pillar` | Cardinal wall slot | No additional properties required. Decorative; maps to `WorldState.PillarFeature`. |

An axis describes **travel through the doorway**, not the span of its panel.
A north/south passage has a door panel spanning east/west.
The editor reports a problem if a wall-mounted feature has no adjacent wall.
The runtime uses its authored slot without repeating that wall-support check.

Wall pillars use the same floor-edge ownership and supporting-wall rules as
buttons and torches, for example `"wall_features": {"north": "pillar_1"}`
with `{"id": "pillar_1", "type": "pillar"}` in `features`. They do not belong
in the centre slot and do not block movement or respond to actions.
The editor and JSON loader support them; game rendering of
`templates\map_wall_pillar.tscn` remains separate and is not connected yet.

Action links contain only `target_id` and `action`:

```json
{
  "id": "button_1",
  "type": "button",
  "action_links": [
    { "target_id": "door_1", "action": "toggle" }
  ]
}
```

V1 supports `open`, `close` and `toggle`, targeting doors. Links execute in
array order. An omitted/empty list means no links. Empty lists are also
accepted on doors, torches and pillars, but only buttons can have non-empty lists.
Existing door behaviour is unchanged: locked doors cannot be opened by
`open`; there is no new key or unlock mechanism.

## Monster groups

Each definition in `monsters` represents one `WorldState.MonsterGroup`.
All definition fields are required by the editor:

| Field | Allowed values |
| --- | --- |
| `id` | Unique non-blank string within `monsters`. Feature IDs use a separate registry. |
| `mon_class` | `skeleton_warrior`. |
| `count` | Integer from `1` to `4`, inclusive. |
| `state` | `idle` or `dead`. |
| `facing` | `north`, `east`, `south` or `west`. |

A floor cell references at most one group through `monster_group`; the
editor expects each group to have exactly one placement. Group definitions
do not store a second position. Doors and wall features may occupy the same
cell. Monster groups currently have no movement-blocking behaviour, so the
editor does not prohibit overlap with the player spawn or a closed door.

The inspector can add, edit and remove groups, including their initial state.
Changing the floor to wall/void removes its group and all references as one
confirmed, undoable operation. Unplaced definitions and missing references
remain editable draft problems rather than being silently discarded.

The loader populates the monster registry and cell reference, but Game does
not yet create monster visuals or implement combat. These records author
state only; they do not make monsters appear in the running game.

## Validation and drafts

In the editor, structural errors prevent opening a document: malformed JSON, unsupported
versions or fields, wrong types, invalid enum names, fractional/out-of-range
coordinates, duplicate cell positions and duplicate feature or monster IDs.
Unknown data is rejected rather than silently discarded.

Structurally valid drafts can be saved and reopened even when not playable.
The editor reports missing/blocked spawn, missing or multiply placed
features, unsupported placements, missing wall support, dangling links and
incompatible link targets. It also reports missing, unplaced, multiply placed
or non-floor monster groups. Unplaced features and groups can be removed from the inspector.
An empty level with `player_start: null` is a normal initial draft.

### Runtime behaviour

Godot trusts editor-authored data rather than running the editor's validator
again. `WorldStateLoader.load_level(name)` reads/parses the file;
`WorldStateLoader.from_document(data)` constructs a fresh `WorldState`.

Missing feature IDs are omitted from cells. Unknown feature types/settings
and unusable records are skipped. Broken, unsupported or non-door-targeted
button links are skipped while the remaining links keep their order.
These cases emit warnings, not a popup or a failed level. The first definition
wins for duplicate feature IDs or cell positions. Extra fields are unused.
Placement ownership and wall support are not audited during loading.

Monster loading is similarly forgiving. Missing groups are omitted from cells;
malformed optional collections, unsupported classes/settings, invalid counts
and unusable definitions are skipped with warnings. First valid definitions
win for duplicate IDs. Omitted settings use the model's defaults: count `1`,
state `idle`, facing `north`. Class and ID still need usable values.
The runtime does not repeat the editor's monster placement audit.

A skipped door means the floor is walkable: the door supplies its blocking.
The file must still be readable JSON with usable cell/feature arrays and
a spawn on an initially walkable floor with a cardinal facing. Those essential
failures return an empty state with `loaded_ok == false` and `load_error`.
Successful construction sets `loaded_ok` after linking the known objects.

## Stable output and evolution

The editor sorts cells by Z then X, features and monster groups by ID and wall slots in cardinal
order, but preserves action-link order. Empty optional collections are
omitted. It does not serialise derived movement blocking, signals, resolved
object references, undo history, selection, pan or zoom.

The optional `monsters` collection and `cell.monster_group` extend version 1
without changing existing field meanings. Existing levels need no migration;
empty monster collections are omitted on save. Older editors reject these
new fields rather than silently dropping groups, so use the updated editor
for levels containing monsters.

The `pillar` feature type also extends version 1 without changing existing
records. Older editors reject the new type instead of discarding it; existing
levels do not require migration.

The centre feature slot remains for an environmental feature, not spawn,
items or monsters. Items still have no authored data type. V1 does not
invent placeholders or accept arbitrary property bags.

The editor tests validate `tests\fixtures\world_state_cases.json`. Native
tests reuse its valid documents and separately check the forgiving runtime
behaviour; the editor's rejection expectations are not duplicated in Godot.
