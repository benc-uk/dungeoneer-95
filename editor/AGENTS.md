# Level editor: agent handover

These instructions apply to the standalone browser editor. Also read the
repository-root `AGENTS.md` when changing Godot integration.

## Start here

| Document | Purpose |
| --- | --- |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Decisions and rationale, module responsibilities, data flow, Godot integration, limits and verification. |
| [DESIGN.md](DESIGN.md) | The existing editor's visual and interaction design, including colours, layout, controls and responsive behaviour. |
| [Level format](../docs/level-format.md) | The authoritative JSON contract shared by the editor and Godot. Do not create a competing schema description. |
| [Repository README](../README.md#create-and-edit-levels) | User-facing launch, editing and file workflow. |

The editor is implemented, not an unbuilt proposal. These documents are
repository context for subsequent sessions, not permission to add features.
Read the current code before editing and update the relevant document when
an intentional change makes it inaccurate.

## Preserve these decisions

- Plain JavaScript ES modules (`.mjs`), HTML, CSS and Canvas 2D. No bundling,
  framework, runtime dependencies, backend or required Node server.
- An empty, sparse grid. Only explicitly painted cells are stored. Void is
  neither an implicit wall nor walkable space. Do not pad a bounding rectangle.
- The browser editor is a modern desktop-style tool with neutral near-black
  and charcoal surfaces, desaturated stone-grey walls and restrained amber
  accents. Avoid an overall brown tint, dungeon textures, ornamental controls,
  pixel fonts or PS1 effects.
- Keep UI and canvas colours in `styles.css` custom properties. `MapCanvas`
  reads the shared `--map-*` tokens; update the legend and design reference
  together rather than introducing a separate hard-coded canvas palette.
- JSON is the level-authoring format. TileMap loading has been replaced;
  retained legacy assets are not an alternative runtime pipeline.
- The current model is `WorldState`, not `LevelState`. Preserve its cell,
  feature and action-link ownership rather than introducing parallel state.
- V1 supports doors, buttons, torches, wall pillars, one player spawn and monster groups.
  Groups use the optional `monsters` registry and `cell.monster_group` ID,
  not environmental feature slots. The current class is `skeleton_warrior`,
  with counts 1 to 4, idle/dead state and cardinal facing. Items are deferred.
  Monster data loads into WorldState; in-game spawning/combat is not connected.
- Pillars use `type: "pillar"` in the feature registry and a cardinal
  `wall_features` slot on a floor cell. They are decorative, require adjacent
  wall support in the editor and have no extra properties or action behaviour.
  The loader creates `WorldState.PillarFeature`; game rendering is not connected.
- Drafts must remain saveable. Structural incompatibility rejects an import;
  authoring problems remain editable and visible. The editor must not silently
  discard unknown fields. Godot deliberately does less checking: it skips
  broken features/links with warnings and only requires usable level data
  and a valid player spawn.
- Prefer native File System Access Open/Save/Save As where available.
  Save writes back to a user-selected file, not through the HTTP server.
  More > Open a copy / Download JSON is the explicit portable fallback.
  Downloads never change the linked file or clear unsaved changes.

## Change safely

- Route document edits through `app.mjs`'s `change()` and the operations in
  `level.mjs`. Never mutate an existing history snapshot from the canvas or DOM.
- Keep selection, hover, pan, zoom and incomplete gestures out of saved JSON.
  One completed gesture is one undo entry; cancellation discards its preview.
- Keep feature and monster group IDs stable while editing. Deletion, placement
  cleanup and any incoming-link cleanup must be one explicit, undoable operation.
- Wall features belong to the **floor cell's edge**, not the wall cell.
  Door axes describe passage direction, not the direction of the door panel.
- Changes to saved data require corresponding updates to `level.mjs`,
  `src\world_state_loader.gd`, the model types where needed, the fixtures and
  `docs\level-format.md`. Keep `WorldState` free of file I/O and JSON parsing;
  do not duplicate the editor's validator in the runtime.
  Incompatible changes need an explicit schema-version/migration decision.
- Use two-space indentation, named ES-module imports/exports, DOM
  `textContent` for imported names/IDs, and existing native controls.
  Do not add npm, TypeScript, a UI library or a generic entity framework
  merely to extend the editor.
- Surface failures in the editor notice area and console. Preserve the
  current document after a cancelled or unsuccessful import.
- Keep native file handles, raw disk contents and the saved-document baseline
  outside history/JSON. Only update the save target and baseline after the
  writable stream closes successfully. Preserve edits made during a save.
- Pickers and permission requests must retain user activation. Treat a
  picker's cancellation as cancellation, not as permission to download.
  A write/close failure is an error even if its name is `AbortError`.
- Check the file's contents before overwriting; do not bypass conflict checks
  when Save As selects the current file. Block concurrent file operations.
  There is no autosave, persisted handle or cross-session recovery.
- Keep `.gdignore` and the JSON export filters intact. The editor and tests
  do not belong in the game's exported resource pack.

## Run and check

Run these from the **repository root**, not the `editor` directory:

```powershell
py -m http.server 8000 --bind 127.0.0.1 --directory editor
node --test editor\tests\level.test.mjs editor\tests\file-access.test.mjs
```

Open `http://127.0.0.1:8000`. Use `python` instead of `py` on systems without
the Windows Python launcher. `file://` is not a supported module-loading path.
Node is needed for tests only.

Native file pickers require a secure context and supporting browser (desktop
Edge/Chrome). Loopback HTTP qualifies. Other browsers use file input/download;
blocked embedded contexts have explicit copy/download actions in More.

For runtime/schema changes, use Godot 4.7 and the commands in
[IMPLEMENTATION.md](IMPLEMENTATION.md#verification). Do not assume a previous
session's server, tool installation or temporary browser scripts still exist.
Documentation-only changes do not require running the game or browser.
