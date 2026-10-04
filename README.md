# Dungeoneer '95

A work-in-progress first-person dungeon crawler inspired by *Dungeon Master*
and *Eye of the Beholder*, with a deliberately retro, PS1-style look. Built
with Godot 4.7, GDScript and the GL Compatibility renderer.

<img src="screenshots/title-screen.png" alt="Dungeoneer '95 title screen" width="640">
<img src="screenshots/gameplay.png" alt="Dungeoneer '95 gameplay" width="640">
<img src="screenshots/gameplay-door.png" alt="Dungeoneer '95 gameplay showing a door" width="640">

## Run the game

1. Install Godot 4.7.
2. Open this repository's `project.godot` in Godot.
3. Run the project with **F5** or the editor's Run Project button.
4. Choose **New Game** to start the current level, Tomb of Valis.

No external dependencies or build steps are required. The project uses a
320x240 viewport with integer scaling.

## How the retro look works

The look is built from a few separate techniques rather than one filter:

- **Low-resolution rendering:** Godot renders to a 320x240 viewport, then
  scales it to the window in integer steps. The configured 1280x960 window is
  a 4x scale. This gives the whole image a coarse pixel grid.
- **Nearest-neighbour sampling:** Project canvas textures and the 3D material
  shader use nearest filtering, keeping texture pixels sharp instead of
  blending neighbouring texels.
- **PS1-style 3D materials:** `materials/ps1.gdshader` is used by the map
  cells, doors and buttons. It snaps geometry towards a screen-pixel grid and
  blends in affine texture mapping, where texture coordinates are not
  perspective-corrected. This recreates the characteristic vertex jitter and
  texture warping associated with early 3D hardware. The shader exposes
  `snap_pixels` and `affine_strength` to tune those effects per material.
- **Output dithering and colour quantisation:** `misc/ps1_output.gdshader`
  samples the rendered screen, applies a repeating 4x4 ordered Bayer dither,
  then rounds each colour channel to 32 levels (5 bits). In the game scene,
  dither strength is set to 1.0.

The game uses Godot's GL Compatibility renderer. The title scene has the same
output shader assigned, but its post-process layer is currently hidden, so
the output dither and colour quantisation apply to gameplay, not the title
screen. This is an oversight. These effects give a retro presentation; they
do not simulate every limitation of original PlayStation hardware.

## Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move forward / backward | W / S or Up / Down | D-pad up / down |
| Turn left / right | A / D or Left / Right | D-pad left / right |
| Strafe left / right | Q / E | Left shoulder buttons |
| Interact | Space | A |
| Show or hide pause HUD | Escape | Start |
| Look around | - | Right stick |

Movement advances one tile at a time. Turns are in 90-degree increments.

## Create and edit levels

The standalone browser editor lives in `editor/`. It uses plain JavaScript
modules and Canvas 2D, with no build step, framework or backend. Serve it
from the project root:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory editor
```

On Windows, use `py` instead of `python` if Python is installed through the
Windows launcher. Open **http://127.0.0.1:8000**. Opening `index.html` directly
through `file://` will not load the JavaScript modules.

Start on an empty grid and paint just the cells you need. **Floor**, **Wall**
and **Erase** work with click-drag strokes or the Rectangle option. Empty
space is neither a saved cell nor an implicit visible wall.

| Editor action | Control |
| --- | --- |
| Select / Floor / Wall / Erase / Spawn | V / F / W / E / P |
| Toggle rectangle painting | R |
| Pan / zoom | Middle-drag or Space-drag / mouse wheel |
| Select neighbouring cell / apply tool | Arrow keys / Enter, with the map focused |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Open / save JSON | Ctrl+O / Ctrl+S |
| Save As | Ctrl+Shift+S |

Use the inspector to add a centre door, wall-mounted buttons, torches and pillars,
button-to-door action links, and a single player spawn with facing. A wall
feature belongs to the edge of the **floor cell beside the wall**. Door
orientation describes the direction of passage.

For a wall pillar, select the adjoining floor cell and choose **Pillar**
in the relevant North/East/South/West wall slot. Its map marker is a circle
with an inner ring. Pillars use the usual move, remove and undo controls,
save as `type: "pillar"` and load into `WorldState`. They are decorative and
do not block movement. In-game pillar rendering is not connected yet.

The **Monster group** section adds one group of **1 to 4 skeleton warriors**
to a floor cell, separate from its door and wall features. Set the count,
initial state (`idle` or `dead`) and facing in the inspector. The map shows
a circular count badge with a facing pointer; `x` marks dead groups.
Removal and painting over a group are confirmed and undoable. Monster data
saves to JSON and loads into `WorldState`, but in-game monster spawning and
combat are not connected yet. Items are not part of the editor.

In supporting browsers (desktop Edge/Chrome), **Open JSON** links to the
selected file and **Save** writes directly back to it, with browser permission.
**Save As** chooses another file; Save on a new level also asks for a location.
The HTTP server does not write files and needs no backend changes. Localhost
works; elsewhere use HTTPS. The editor does not remember file handles after
the page closes.

**More > Open a copy** imports without linking to the original file.
**More > Download JSON** exports a copy without altering the open file or
clearing unsaved changes. Browsers without native file access use the file
input for Open and show Download JSON instead of Save. If an embedded browser
blocks native access, use a normal browser tab or these explicit fallbacks.

Cancelled pickers and failed writes preserve your work. If the file changes
outside the editor, saving stops rather than overwriting it: use Save As
to keep your version separately, or reopen the file. Save unfinished drafts
whenever needed. The editor still flags authoring problems, but the game
skips missing features and broken button links with warnings instead of
rejecting the whole level. It still needs readable level data and a usable
player spawn. A missing door leaves its floor cell walkable.

Up to 100 editing operations can be undone. Large strokes/rectangles are
limited to 50,000 cells per gesture to avoid freezing the browser, not to
impose map bounds.

To edit the current game level, open `levels/tomb.json` and save your changes.
With the download fallback, replace it with the downloaded file yourself.
**New Game** still starts `tomb`.
For another level, save `levels/<name>.json` and pass that basename to
`start_new_game()` in `src/title.gd`. There is no in-game level browser.

See [the JSON format reference](docs/level-format.md) for cells, features, monsters,
coordinates, draft rules and validation. The old TileMap scene and TileSet
are retained as references but are no longer loaded by the game.
`WorldStateLoader.load_level(name)` handles reading and construction;
`WorldState` contains the data types and gameplay behaviour.

For development or a new AI session, start with
[the editor handover](editor/AGENTS.md). It links to the
[design system](editor/DESIGN.md) and
[implementation guide](editor/IMPLEMENTATION.md), including decisions,
module ownership, Godot integration, limitations and verification.

## Current status

This is an early prototype. New Game starts the Tomb of Valis level. The title
screen's Load Game button and a fully implemented pause system are not yet
available. Levels and feature placements are authored through the JSON editor.
Gameplay beyond movement, doors, buttons and torches is still being developed.

## Animated skeleton and model tools

Open `tools/models/model_preview.tscn` in Godot and press **F6** to inspect the
new skeleton's idle, walk, attack and death animations. The model has 1,016
triangles, 20 rigidly weighted bones and a small pixel atlas.

Use `models/skeleton_warrior/skeleton_warrior.glb` as a standalone animated
asset, or instance `templates/skeleton_warrior.tscn` for the project's retro
material and 0.3 visual scale. It is not yet connected to gameplay.

The reusable native Godot generator uses separate model recipes and requires
no extra installations. See [the model workflow](docs/model-pipeline.md) for
regeneration, import settings, preview controls and creating further models.

## Project layout

- `editor/`: Standalone, no-build browser level editor.
- `levels/`: JSON levels and retained legacy TileMap authoring assets.
- `src/`: Grid, world-state, player, title and game scripts.
- `templates/`: Reusable map-cell and feature scenes.
- `tools/models/`: Native model generator, recipes and reusable preview.
- `tests/`: Shared level-format cases and a native Godot test runner.
- `materials/`, `misc/`, `textures/`, `models/`, `fonts/`, `audio/`, `art/`:
  Game assets, materials and shaders.

## Focused checks

```powershell
node --test editor\tests\level.test.mjs editor\tests\file-access.test.mjs
godot --headless --path . --editor --import
godot --headless --path . --script tests\test_world_state.gd --quit-after 600
godot --headless --path . --script tests\test_model_assets.gd --quit-after 600
godot --headless --path . --quit-after 30
```

Use a Godot 4.7 executable. Node is only needed for the editor's tests, not
to run the editor. The final command is a startup smoke check, not a gameplay
or browser interaction test.
