# Level editor implementation

This records the implemented editor and its design decisions as of
4 October 2026. Update it when behaviour changes; code and shared fixtures
must be inspected rather than treating this document as a frozen API.
Paths below are relative to the repository root unless stated otherwise.

For visual rules see [DESIGN.md](DESIGN.md). For exact fields, defaults and
validation rules see the [level format](../docs/level-format.md).

## Purpose and decisions

The editor replaces awkward TileMap-based authoring with a small, standalone
tool for drawing dungeon cells and editing the data that Godot actually uses.
Its output is an authored level, not a saved game.

| Decision                                                 | Reason                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native JavaScript modules and a static HTTP server       | Keep the code understandable and runnable without a build pipeline or application server.                                                        |
| Sparse, open-ended grid                                  | Storing a rectangle full of unseen wall cells was explicitly rejected. Painting creates data; surrounding workspace does not.                    |
| Familiar tools, large canvas, right-hand inspector       | Drawing the layout is the primary job. Feature details should not clutter the map.                                                               |
| Near-black palette with restrained warm accents          | Neutral charcoal surfaces and desaturated stone keep the editor from feeling too brown; amber details relate to the game without a dungeon skin. |
| Separate feature registry with ID references             | Mirrors `WorldState` and supports ordered button links without duplicating feature state.                                                        |
| Replace the TileMap runtime loader                       | There is one authoring format to maintain, not two competing implementations.                                                                    |
| Editor validation, forgiving runtime loading             | Keep authoring checks in the editor. Godot skips broken features/references rather than repeating a full validator or refusing the whole level.  |
| Native file handles with explicit copy/download fallback | Supporting browsers can save directly to the game file without a backend; other browsers retain a usable, clearly labelled export workflow.      |
| Separate monster registry with cell references           | Matches `WorldState.MonsterGroup`; one group per floor cell without overloading environmental feature slots. Spawning/combat remains separate.  |
| Items later                                              | Their data model is not defined yet. Do not invent placeholder types.                                                                           |

The converted Tomb is `levels\tomb.json`. The original scene, TileSet and
palette remain in the repository as references. Do not restore hard-coded
button/torch placement or silently delete those legacy assets.

## Module map

| File                                     | Responsibility                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `editor\index.html`                      | Static application shell, canvas, tool buttons, inline SVG symbols, file input, notices and native confirmation dialog.         |
| `editor\styles.css`                      | Near-black UI with warm accents, shared `:root` colour tokens and responsive layout. No CSS build tooling or external fonts.    |
| `editor\level.mjs`                       | DOM-free document model, validation, normalisation, stable serialisation, geometry helpers, edit operations and `History`.      |
| `editor\app.mjs`                         | Owns `History`, UI selection/tool state, dirty tracking, file operations, confirmation and the document-change/render pipeline. |
| `editor\file-access.mjs`                 | Native picker feature detection, cancellation handling, raw file reads, write permissions, conflict checks and staged writes.   |
| `editor\canvas.mjs`                      | `MapCanvas`: pointer/keyboard gestures, hit testing, viewport state, Canvas 2D rendering and redraw scheduling.                 |
| `editor\inspector.mjs`                   | Builds native DOM controls for the selected cell/slot, monster group, properties, links and unplaced definitions. Calls supplied edit hooks. |
| `editor\tests\level.test.mjs`            | Node's built-in tests for the model, editing operations and shared contract cases.                                              |
| `editor\tests\file-access.test.mjs`      | Dependency-free file-handle contract tests for permissions, cancellation, conflicts, staged writes and failures.                |
| `tests\fixtures\world_state_cases.json`  | Editor validation cases and valid documents reused by native loader tests.                                                      |
| `tests\fixtures\directions.json`         | Directional torch, door-axis and sparse-boundary integration fixture.                                                           |
| `tests\test_world_state.gd`              | Native construction, forgiving references, essential failures, interaction and scene-binding checks.                            |
| `src\world_state.gd`                     | State, nested cell/feature types, runtime interaction and walkability. No loading or validator dependency.                      |
| `src\world_state_loader.gd`              | File/JSON reading, feature/monster/cell construction and resolution of known references and action targets.                      |
| `src\game.gd`                            | Builds visuals from that state and passes the same state to Player.                                                             |
| `editor\.gdignore`, `export_presets.cfg` | Keep editor files outside Godot's resource scan; include level JSON and exclude tests in exports.                               |

The browser never imports GDScript. The agreement between the implementations
is the documented format and shared fixtures, not generated bindings.

## State and data flow

The editor separates document, history, file and view state:

| State                                                                                                       | Owner                                         | Saved to JSON?                        |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------- |
| Level name, spawn, cells, features, monster groups and action links                                         | `history.present`, created by `createLevel()` | Yes, through `toDocument()` only.     |
| Previous/next document snapshots                                                                            | `History.past` and `History.future`           | No.                                   |
| Filename, native file handle, raw last-known disk text, serialised saved baseline and active file operation | `app.mjs`                                     | No, and not included in undo history. |
| Selection, active slot/tool, rectangle mode, viewport and pending gesture                                   | `app.mjs` and `MapCanvas`                     | No.                                   |

In memory, `cells` is a `Map` keyed by `"x,z"`; each record also carries its
`pos`. `features` and `monsters` are separate `Map`s keyed by ID. On disk they are arrays.
In Godot they become `Dictionary[Vector2i, Cell]` and
the separate `Dictionary[StringName, Feature]` and
`Dictionary[StringName, MonsterGroup]` registries.

`createLevel()` validates imported structure and clones it before creating
maps. `toDocument()` writes the allowed fields, sorts cells by Z then X,
sorts feature/monster IDs and orders cardinal wall slots. It deliberately preserves
action-link order. Omitted optional collections mean empty; derived blocking,
signals and resolved object references are never serialised.

New feature IDs use the next available `<type>_<number>`. Existing and
imported IDs are preserved. There is no manual ID-renaming interface.
`placements()` derives locations from cell references; feature records do
not maintain a second independent location.
`WALL_FEATURE_TYPES` supplies the button/torch/pillar choices to the inspector,
placement operations and validator. Pillars have stable `pillar_<number>` IDs,
use the existing wall-move/deletion/history flow, and need no extra saved
properties. The canvas draws their shared-colour ring markers on cell edges.
Monster IDs use the next available `monster_<number>`. `monsterPlacements()`
derives locations from `cell.monster_group`, which holds one group ID and is
separate from the environmental feature slots. The current authoring choices
are skeleton warriors, counts 1 to 4, idle/dead state and cardinal facing.
Optional monster fields extend v1; existing levels need no migration and
empty monster collections are omitted on save.

### Document changes and undo

`app.mjs`'s `change()` clones `history.present` with `structuredClone()`,
applies an operation, checks structural validity, and calls `History.commit()`.
The operation may mutate that new clone, never a stored snapshot. No-op
serialisations do not create undo entries. A real edit clears redo history;
up to 100 previous snapshots are retained.

Painting a populated floor into wall/void can remove its features, monster group and spawn.
`paintImpact()` and `removalImpact()` calculate the consequences before a
single confirmation. `deleteFeatures()` removes the definitions, all
placements and incoming action links together. Undo restores the whole edit.
Removing a supporting wall does not silently remove another cell's feature;
it creates a visible playability problem.
`deleteMonsterGroups()` removes group definitions and all their cell references
without changing features or links. Group removal uses the same confirmation
and history pipeline, including missing references and unplaced definitions.

### Canvas gestures

The canvas stages a stroke in a temporary coordinate map while pointer
capture is active. `lineCells()` interpolates samples; `rectangleCells()`
creates inclusive bounds in either drag direction. `pointerUp()` submits
one operation. Escape, pointer cancellation, lost capture or window blur
discard a pending paint preview. The document is not modified per pointer move.

Screen coordinates are converted using the viewport offset and cell size
with `Math.floor()`, including negative coordinates. Cell positions are
`[x, z]`: right is +X, down is +Z, north is -Z. Do not confuse this with the
canvas's pixel Y or Godot's vertical world Y.

`ResizeObserver` sizes the canvas backing store for device pixel ratio.
Drawing uses CSS-pixel coordinates after setting the context transform.
`drawSoon()` coalesces work through `requestAnimationFrame`; there is no
continuous simulation loop. Off-screen cells are skipped while drawing.
Zoom is anchored to the pointer. Fit/reveal change only the viewport.

`MapCanvas` obtains its palette from the computed `--map-*` CSS properties
at construction, and rejects missing/invalid colours rather than silently
painting with a previous context colour. The DOM legend uses the same tokens.
The single dark theme applies to panels, controls, overlays, feedback and map
notation; it does not alter geometry, file data or the game's renderer.

The inspector is rebuilt on selection/document changes and restores the
focused control by ID where possible, plus its scroll position. Preserve
stable control IDs when adding fields so keyboard editing does not regress.

## Validation and file handling

The editor has two levels of validation. The runtime intentionally does not
repeat its full checks:

| Result                  | Editor                                                    | Godot                                                                                                       |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Structural errors       | Reject import without replacing the current document.     | Fail only if the level cannot be read/constructed; skip unusable optional records with warnings.            |
| Authoring problems only | Open, edit and save as a draft; show selectable problems. | Skip broken references; do not audit placement ownership or wall support. A usable spawn is still required. |
| Neither                 | Ready to play.                                            | Construct the world and set `loaded_ok`.                                                                    |

The JavaScript validator returns `{ errors, problems }`; problems carry
`message`, `pos`, `feature_id` and `monster_id` for navigation. Godot has no corresponding
validation report or validator class. Its loader returns a `WorldState` with
`loaded_ok`/`load_error`, and reports skipped references through warnings.

### Native Open, Save and Save As

`supportsNativeFiles()` checks the secure context and both picker functions,
not the browser's user-agent string. Desktop Edge/Chrome support them.
Loopback HTTP such as `http://127.0.0.1:8000` is a secure context; non-local
deployments need HTTPS. Embedded contexts or browser policies can still deny
access even when the functions exist.

Open calls `showOpenFilePicker()` from the user action, reads through
`handle.getFile().text()`, and validates before asking to replace dirty work.
Only an accepted document replaces the current file handle. Keep the picker
call before asynchronous custom confirmations that could lose user activation.
New/Open reset undo history; cancelled, denied and invalid opens preserve
the current document and file binding.

Save writes to the linked handle. With no linked handle, it behaves as Save As.
Save As uses `showSaveFilePicker()` and switches targets only after a successful
write. `isSameEntry()` detects choosing the original file again, even through
a different handle, so Save As cannot bypass an existing conflict.

`writeFileText()` requests `readwrite` permission before disk reads, compares
raw contents with the last-known disk text, and requests an exclusive writable
stream. It checks contents again after opening the stream and before closing
the staged write. A mismatch raises `FileChangedError`; write failures abort
the stream, and cleanup failures retain both errors. These are best-effort
external-edit checks, not an OS-wide atomic compare-and-swap guarantee.
Another program can still race the final check and commit.

Only successful `close()` updates the file handle, filename, raw disk baseline
and serialised saved snapshot. New/Open/Save/Save As and copy/download operations
cannot overlap. Editing the current document can continue during a save:
the saved snapshot, not a newer live edit, becomes the baseline, so newer edits
remain dirty. The close-page warning also applies while a save is pending.

Only picker `AbortError` means benign cancellation. Write/close `AbortError`,
revoked permissions, missing files and locked files are genuine errors, not
reasons to silently download or report success. Recovery is explicit:
allow editing, save to another file, reopen the changed file, or download a copy.

### Portable copy and download

More > Open a copy uses the file input and `File.text()` without attaching a
write handle. More > Download JSON exports a Blob through `<a download>`.
It does not change the current file binding or clear dirty state, because
the browser cannot confirm a completed disk write. The notice says
"Download requested", not "Saved".

Without the native APIs, Open JSON uses the file input and the primary button
is labelled Download JSON. Save As and More are hidden. This fallback never
silently replaces a cancelled native operation.

File access is performed by the browser, not the Python server. A file chosen
from `levels` need not be inside the directory served over HTTP. Handles are
kept only for the current page lifetime, not persisted in IndexedDB; reopening
the editor requires selecting a file again. There is no autosave, session
recovery, live reload into Godot or backend write endpoint.

Imported names and IDs continue to use DOM `textContent`, not HTML.

## Godot integration and traps

`WorldStateLoader.load_level("tomb")` reads `res://levels/tomb.json` using
`FileAccess` and `JSON.new().parse()`. `from_document(data, source)` handles
already parsed data and is also used by tests. Both return a fresh state;
`WorldState.new()` merely constructs an empty data object. There is no
constructor loading, `load_document()` method or `validate_document()` API.

The dependency is one-way: Game calls the loader, and the loader uses
`WorldState` and its nested types. It creates registered feature objects,
creates cells using known IDs, then connects valid button links to those
same objects. Do not make the state call the loader, add an autoload or
introduce a separate runtime validator.

Missing cell-feature references are omitted. Unsupported feature definitions
and broken/incompatible action links are warned about and skipped; remaining
links retain their order. Duplicate definitions keep the first record.
Unused metadata, unplaced features and missing supporting walls do not block
loading. The editor owns the broader schema/authoring checks.

Essential failures, such as unreadable/unparseable input, missing cell arrays
or an unusable spawn/facing, return an empty unloaded state with `load_error`.
Game retains its error-and-return-to-title flow for those failures only.
Successful construction sets `loaded_ok`; optional warnings do not populate
`load_error`. Skipping a missing door leaves a walkable floor.

Lowercase enum names map to Godot enum names. A small coordinate conversion
guard avoids invalid `Vector2i` construction; there is no runtime schema
version, unknown-field, placement-count or neighbour-support audit.

Monster definitions load before cells; known IDs are stored in
`Cell.monster_group` and resolve through `WorldState.get_monster_group()`.
The loader warns and skips malformed collections/records, unsupported classes
or enum values, and counts outside the integer range 1 to 4. JSON numbers
arrive as floats, so check integrality/range before converting to `int`.
Missing group references are omitted. The runtime does not audit floor
ownership or duplicate placements. Monster groups do not change walkability.
Game instances `templates\monster_group.tscn` at each referenced cell and
applies the group's facing. The current template has two skeletons; authored
count/state and combat are not yet connected to those visuals.

The important rendering details are:

- Buttons and torches belong to a floor cell's cardinal wall slot. Player's
  interaction lookup uses its current cell and logical facing.
- Pillars also occupy a floor cell's cardinal wall slot and load as
  `WorldState.PillarFeature`. They are non-blocking and have no action
  behaviour. The editor checks supporting walls; the runtime does not.
  Rendering `templates\map_wall_pillar.tscn` is not connected by this work.
- The button template's base side is east; the torch template's base side
  is west. Game uses `Grid.dir_to_angle(dir)` for buttons and subtracts
  `Grid.dir_to_angle(Grid.Dir.WEST)` for torches.
- The skeleton model's front is +Z (south), whereas `Grid.dir_to_angle()`
  uses +X (east) as zero rotation. Monster groups subtract
  `Grid.dir_to_angle(Grid.Dir.SOUTH)` from the authored facing angle.
  Do not change the shared helper or editor enum to compensate for a model's
  local front axis. The directional fixture checks each model's actual
  world-space front against `Grid.STEP` for all four facings.
- `DoorFeature.axis` describes **passage direction**. North/south is the
  default template rotation; east/west rotates it 90 degrees. Never infer
  orientation by indexing a neighbouring cell on a sparse map.
- The active door script is embedded in `templates\map_door.tscn`.
  `src\map_door.gd` is not the script used by that scene. Initial binding seeks
  the open/closed pose with event updates skipped, then pauses; later state
  changes use the existing animation and sound.
- `TorchFeature` is the current GDScript class spelling. Do not introduce a
  second class accidentally. Renaming it requires updating every reference.
- `FeatureType` still lists unimplemented types. The v1 supported types are
  the loader's door/button/torch/pillar constructors, not every enum entry.
- `WorldState` owns map/feature state. Player still owns its logical position,
  facing and movement animation. `Global` is not a gameplay-state store.

Both export presets explicitly include `levels/*.json` and exclude `tests/*`.
When verifying a resource pack, run from outside the source checkout:
`FileAccess` can otherwise find source files and hide a missing export.

### Tomb migration baseline

The initial conversion retained 132 authored cells, three doors, one button,
three uniquely identified torches, and spawn `[1, 6]` facing north. Button
`btn1` toggles `door_2_5`. Duplicate legacy torch ID `t2` was replaced with
distinct IDs for the three intended placements.

These are regression expectations in the tests, not map-size constraints.
If Tomb is intentionally edited, review those assertions rather than
restoring obsolete hard-coded content to satisfy them.

## Verification

Run from the repository root:

```powershell
node --test editor\tests\level.test.mjs editor\tests\file-access.test.mjs
godot --headless --path . --editor --import
godot --headless --path . --script tests\test_world_state.gd --quit-after 600
godot --headless --path . --quit-after 30
```

Use an actual Godot 4.7 executable, not an older installed binary. Inspect
diagnostics as well as the exit code. The last command starts the title; it
does not exercise New Game or prove browser/game rendering.

The checked-in tests cover editor structural/playability cases, sparse and
negative coordinates, stable round trips, ordered actions, deletion, undo/redo,
interpolation, Tomb migration, directional torch placement, both door axes
and initial door poses. Monster coverage includes optional legacy data,
all count bounds and directions, state, stable IDs, independent feature slots,
draft references/placements, removal and undo/redo. Native tests check skipped feature IDs and links,
usable spawn requirements and clean failure states rather than reproducing
the editor's validator. File-access tests cover
immediate picker invocation, cancellation versus failure, permission denial,
external changes before/during a write, close completion and stream cleanup.
`tests\fixtures\wall_pillars.json` is shared by the editor and native loader
tests. Pillar coverage includes all four wall slots, stable round trips,
move/remove/undo, occupied slots, supporting-wall warnings, unsupported
properties and rejection/skipping of action links.

For canvas, input or UI changes, also check the browser: fast strokes,
rectangle bounds, cancelled gestures, pan/zoom/resize hit testing, keyboard
selection, focus retention, feature/link controls, file cancellation, invalid
imports, direct saves, Save As, draft downloads and the narrow-screen
inspector's close button. Check denied permissions, disk errors, external
edits, overlapping file shortcuts and editing while a save is pending.
Then load an actual saved file in graphical Godot and check spawn,
feature directions, button interaction and walking through a door.

Initial implementation also exercised browser downloads through graphical
Godot and loaded isolated Windows/Web resource packs. The browser automation,
screenshots and migration helper were session-local tools, **not a checked-in
browser test suite** or a required Playwright dependency.

Native-file verification also used real Edge/Windows Open and Save dialogs:
a temporary file was saved, reopened and overwritten with Ctrl+S without a
download, and a subsequent external edit was protected from overwrite.

## Limits and future work

- Desktop mouse/keyboard is the primary workflow. Responsive layout is not
  a complete mobile/touch authoring system.
- One gesture can affect at most 50,000 cells; history retains 100 operations.
  These are safeguards, not fixed map bounds. Snapshot memory grows with
  document size; no large-world performance guarantee is implied.
- Current cell size starts at 48 CSS pixels and zoom is bounded from 0.125
  to 128 pixels per cell. Fit does not guarantee arbitrarily distant cells
  can all be displayed at the minimum zoom.
- No flood fill, automatic wall generation, multiselection/move system,
  3D preview, level browser in the game or collaboration.
- Doors may start locked, but there is no new key/unlock mechanic.
- Game shutdown sometimes reported existing MP3 playback/custom-cursor
  resource cleanup diagnostics during initial checks. Establish a fresh
  baseline before attributing those to editor changes; do not ignore script,
  parse or load failures.

When adding items, another monster class or another feature, define the real Godot model
first. Update the format/version policy, editor validator, runtime loader, serialisation,
history/deletion behaviour, inspector, canvas, game visuals and shared tests
together as applicable. Keep entity collections separate from the single
environmental centre slot, and avoid a generic framework until a concrete
requirement justifies it.
