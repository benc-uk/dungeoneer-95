# Low-poly model workflow

The skeleton warrior is an independently modelled, rigid-skinned character
inspired by the existing `models\Skeleton\skeleton.obj`. The reference mesh,
textures and hidden player test instances are unchanged.

## Use the skeleton

| File | Use |
| --- | --- |
| `models\skeleton_warrior\skeleton_warrior.glb` | Portable model with embedded mesh, material, texture, rig and animations |
| `templates\skeleton_warrior.tscn` | Ready-to-instance Godot scene with the game's PS1 material and 0.3 visual scale |
| `tools\models\model_preview.tscn` | Standalone preview; open in Godot and press F6 |
| `models\skeleton_warrior\skeleton_warrior_albedo.png` | Generated atlas used by the wrapper's shader override |

The asset has **1,016 triangles**, **20 bones**, one material and a **64 x 32**
atlas. Geometry includes the short sword and plain round shield. The rig is
rigid: each vertex follows exactly one bone. There is no runtime generation,
IK, physics, AI, combat logic or collision.

The source model is about 1.815 units tall. Y is up, +Z is forward, and +X is
the character's left. Its origin is on the floor between its feet. The
wrapper root stays at identity; its `Visual` child scales the model by 0.3,
giving a standing height of about 0.545 units for this project's one-unit
cells. Do not apply that scale again to the rig or its animation tracks.

The wrapper does not start an animation automatically. A caller can use:

```gdscript
var warrior := preload("res://templates/skeleton_warrior.tscn").instantiate()
add_child(warrior)
var animation_player := warrior.get_node("Visual/Model/AnimationPlayer") as AnimationPlayer
animation_player.play("idle")
```

No enemy is added to the game by this work. The title, player, game and level
format have not been changed.

## Animation contract

| Clip | Length | Loop | Behaviour |
| --- | --- | --- | --- |
| `idle` | 2.4 seconds | Yes | Guard stance, slight weight shift and head/jaw movement |
| `walk` | 1.2 seconds | Yes | In-place steps with knee/ankle articulation and restrained arm movement |
| `attack` | 1.25 seconds | No | Sword wind-up, slash and recovery to guard |
| `die` | 1.8 seconds | No | Backward stagger and collapse, holding the final pose |

Movement is interpolated, not stepped. The actor's root does not move in any
clip. The pelvis moves within the rig for weight shifts and the collapse.
Locomotion must be supplied by a future caller, not extracted from the walk.

Every clip has explicit position and rotation channels for every bone.
This prevents a death pose or attack from leaving stale transforms when a
different clip starts. Walk and death contact corrections are calculated
offline and baked into ordinary animation keys. They do not require a
runtime solver or change the game's frame rate.

### Importing into another Godot project

Copy just the GLB into the destination project's resource directory. Godot
imports its geometry, standard material, embedded texture, skin and four
clips without any files from `tools\`, project shaders or Blender.

The GLB export does **not** preserve Godot's animation loop flags. In the
GLB's **Advanced Import Settings**, select `idle` and `walk` and set their
loop mode to **Linear**. Keep `attack` and `die` at **None**, then reimport.
Keep **Remove Immutable Tracks** disabled to preserve the full pose-channel
contract. Disable generated mesh LODs if preserving the authored topology.

This repository's `skeleton_warrior.glb.import` already records those choices,
including embedded image handling. Keep that sidecar in source control.
Godot may expand its animation settings with many default slice entries;
these are importer-generated, not extra animation clips.

The portable GLB uses a normal rough, non-metallic material. The retro shader
is a local override in `templates\skeleton_warrior.tscn`, not a requirement
of the model. The wrapper also adds a conservative culling margin so the
slash and collapse do not disappear outside the standing mesh bounds.

## Preview controls

Open `tools\models\model_preview.tscn` and press **F6**.

- Choose a clip, then use **Pause/Play** or **Replay**.
- Use **Front**, **Side**, **Rear** or **3/4** to inspect the model.
- **Dungeon** switches from neutral lighting to warm dungeon lighting.
- **PS1** toggles the existing output dither/colour shader. The wrapper's
  3D material remains active independently.
- The floor outline is a one-unit square. The status line reports triangles
  and standing height.

The preview retains the project's 320 x 240 viewport and integer scaling.
It uses local UI controls and does not add global input actions.

To inspect a different model, assign another `PackedScene` to **Model Scene**
on the preview root in the Inspector. For example, select the GLB directly
to see its standard material at source scale, or use another wrapper scene.
The camera fits the chosen model. Static scenes also work, with animation
controls disabled. Only one model is loaded when the preview starts.

## Regenerate the model

Only the installed Godot 4.7 executable is required. No packages, DCC
applications or plugins are installed by the pipeline. Use the console
executable on Windows if you want complete command output:

```powershell
$Godot = 'C:\Apps\godot\Godot_v4.7.2-stable_win64_console.exe'
& $Godot --headless --path . --script tools\models\build_model.gd -- --recipe res://tools/models/recipes/skeleton_warrior.gd --output res://models/skeleton_warrior/skeleton_warrior.glb
& $Godot --headless --path . --editor --import
& $Godot --path . res://tools/models/model_preview.tscn
```

Set `$Godot` to the installed executable on your machine. Scripts and scenes
do not contain this workstation path.

The recipe and shared builder are the editable source. Regeneration replaces
the GLB and sibling `<basename>_albedo.png`. Make geometry, palette and pose
changes in the recipe, not by hand-editing the generated outputs.

The exporter validates geometry and budgets, writes a temporary GLB, checks
that Godot can read it, then replaces the delivery file. Invalid recipes or
export failures report an error and a non-zero exit code. Export to a new
filename when experimenting; do not target the original reference assets.

`--editor --import` produces script `.uid` and asset `.import` sidecars.
Keep those files. Never edit or commit the generated `.godot` cache.

## Create another model

| Source | Responsibility |
| --- | --- |
| `tools\models\build_model.gd` | Runner, validation and native GLB export |
| `tools\models\model_builder.gd` | Small geometry, atlas, rigid-skin and animation helpers |
| `tools\models\recipes\skeleton_warrior.gd` | Character-specific anatomy, equipment, rig and motion |
| `tests\fixtures\models\hinged_marker.gd` | Minimal independent recipe showing reuse |

A recipe extends `RefCounted` and implements `build() -> Builder`, where
`Builder` is a preload of `model_builder.gd`. Read the hinged-marker recipe
for a complete small example. Use the concrete `Builder` type in helper
parameters: GDScript then correctly types array literals passed to geometry
and animation methods.

1. Add bones in parent-before-child order with `add_bone(name, parent, pivot)`.
   Pivots are model-space positions. Use an empty parent name for a root.
2. Build `box`, `tube`, `ellipsoid` or explicit `face` geometry. Geometry
   positions are also model-space. Give every part a bone name and palette
   swatch. Face helpers use the supplied outward direction to produce Godot's
   clockwise winding and flat normals.
3. Set the eight `palette` colours. The shared builder makes a deterministic
   64 x 32 atlas with subtle pixel variation and UVs for its swatches.
4. Add clips with time-stamped pose dictionaries. `rotations` maps bone names
   to local Euler angles in **degrees**, converted to quaternion tracks.
   `offsets` maps bone names to position offsets from their local rest pose.
   Missing channels mean rest pose, not a value held over from another key.
   Include both the initial and final keys.
5. Run the common exporter with the new recipe and a new GLB output path.
   Configure import loops explicitly, add a wrapper if needed and select it
   in the existing preview.

The builder defaults to a 1,200-triangle and 24-bone limit. These are asset
budgets, not claims about exact PlayStation hardware limits. Change a future
recipe's budgets deliberately rather than adding detail without measuring.
There is no generic OBJ auto-rigger, automatic retargeting or modelling UI.

## Checks

```powershell
& $Godot --headless --path . --script tests\test_model_assets.gd --quit-after 600
& $Godot --headless --path . --script tests\test_world_state.gd --quit-after 600
& $Godot --headless --path . --quit-after 30
```

The model runner checks deterministic generation, rejection of invalid
geometry, closed skull topology and face winding, an independent animated
recipe, actual imported mesh/skin data,
budgets, clip tracks, root motion, sampled floor contact, loop boundaries,
death hold, return to idle, wrapper settings and reusable preview controls.
The gameplay runner checks that existing world-state behaviour still works.

For a portability check, copy only the GLB into a separate minimal Godot
Compatibility project. Import it, then run the independent test script using
its absolute path:

```powershell
$CleanProject = 'C:\path\to\clean-project'
$PortabilityTest = Join-Path (Get-Location) 'tests\test_model_portability.gd'
& $Godot --headless --path $CleanProject --editor --import
& $Godot --headless --path $CleanProject --script $PortabilityTest -- res://skeleton_warrior.glb idle walk attack die
```

That test does not preload the generator, reference asset or project shaders.
It can also check other models by accepting their GLB path and clip names.
Loop configuration is intentionally a separate importer concern.

Also inspect every animation with graphics enabled, at low resolution and
from several angles. Headless checks alone cannot assess silhouette,
readability, intersections or whether the motion looks right.

The existing project has a custom-cursor texture cleanup warning on graphical
shutdown, reproduced with an empty runner that does not load this model.
Do not mistake that existing warning for a failed GLB import.
