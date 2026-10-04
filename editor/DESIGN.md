---
name: "Dungeoneer '95 level editor"
description: "A near-black, canvas-first desktop map editor with restrained warm accents."
colors:
  background: "#101010"
  surface: "#161616"
  surface-raised: "#1e1e1e"
  control: "#222222"
  hover: "#2b2b2b"
  active: "#333333"
  text: "#e5e2dc"
  muted: "#b6b2aa"
  line: "#393632"
  control-border: "#716c63"
  line-hover: "#918a7e"
  accent: "#d8ab73"
  accent-hover: "#e8bf8a"
  accent-ink: "#211a13"
  selected: "#332c21"
  selected-text: "#f1cf9f"
  selected-border: "#b38c59"
  warning: "#e9bd78"
  warning-background: "#2e271a"
  ready: "#acc39a"
  danger: "#edaa97"
  error-background: "#30201d"
  error-border: "#9e6d58"
  notice-background: "#22211e"
  notice-text: "#cec8bd"
  notice-border: "#535049"
  shadow: "#00000055"
  dialog-shadow: "#00000080"
  backdrop: "#000000b3"
  map-void: "#0b0b0b"
  map-grid: "#262523"
  map-axis: "#484339"
  map-floor: "#282724"
  map-wall: "#7d776d"
  map-wall-hatch: "#a09889"
  map-door: "#e0bb84"
  map-locked-door: "#de947d"
  map-button: "#a4baa1"
  map-torch: "#f3ae62"
  map-pillar: "#c4c0b5"
  map-monster: "#b8adca"
  map-monster-dead: "#edaa97"
  map-selection: "#f7d8a6"
  map-hover: "#f7d8a699"
  map-paint-floor: "#d8ab7366"
  map-paint-wall: "#a0988980"
  map-paint-erase: "#edaa9766"
  map-marker-ink: "#211a13"
  map-coordinates: "#b6b2aa"
  map-missing: "#edaa97"
typography:
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
  title:
    fontSize: "16px"
    fontWeight: 650
  section:
    fontSize: "14px"
    fontWeight: 650
  label:
    fontSize: "12px"
  data:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "11px"
rounded:
  control: "5px"
  dialog: "8px"
components:
  button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  input:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
---

# Design system: level editor

## Overview

**Direction: "Straightforward map editor".**

The user chose a familiar desktop-tool layout: compact painting tools, a
large empty canvas, a right-hand inspector and file actions along the top.
The interface should make drawing and inspecting a dungeon obvious, not
become an ornamental dashboard.

Use neutral near-black and charcoal backgrounds, with restrained amber and
stone accents related to the game's assets. The user found the earlier
brown-heavy palette too warm: keep warmth mainly in selected controls and
feature markers, not across every surface. Small sage accents echo the moss.
These are flat UI colours, not dungeon textures. Keep system typography,
familiar controls and the existing working layout.

This design applies only to the standalone browser editor. The game's
low-resolution rendering, PS1 effects, artwork and fonts remain separate.
There is one default dark theme, not a light/dark switch or a theme framework.

All colours live in the `:root` custom properties in `styles.css`.
`MapCanvas` reads the `--map-*` properties once when it is constructed, so the
canvas, DOM legend and interface share the same palette. The marker ink,
coordinate text and missing-feature colour reuse the corresponding UI tokens.
The frontmatter above records their resolved values. Do not reintroduce
hard-coded canvas colours or a competing palette.

## Colors

Charcoal panels sit above a near-black canvas, with subtly raised grey
controls. Soft off-white text avoids stark white on black.
Amber identifies actions and focus; a lighter sand accent keeps map selection
visible over both floor and wall. Feature colours are semantic map notation,
not decorative accents.

| Role | Use |
| --- | --- |
| `accent`, `accent-hover`, `accent-ink` | Amber primary actions and focus, with dark text on filled primary buttons. |
| `selected`, `selected-text` | Pressed tools and the selected cell-type control. |
| `text`, `muted` | Main labels versus hints, coordinates and secondary file information. |
| `line`, `control-border`, `selected-border` | Quiet panel separators, stronger field boundaries and highlighted controls. |
| `background`, `surface`, `surface-raised`, `control` | Application background, panels/toolbars, overlays and fields. |
| `map-void`, `map-grid`, `map-axis`, `map-floor` | Near-black empty space, subdued grid/origin lines and charcoal floor cells. |
| `map-wall`, `map-wall-hatch` | Desaturated stone-grey walls with technical hatching, not a stone texture. |
| `map-door`, `map-locked-door` | Bronze door bars and muted rust locked doors; locked doors also have an `L`. |
| `map-button`, `map-torch` | Sage squares and amber-orange triangles on the corresponding cell edges. |
| `map-pillar` | Pale stone circular markers with an inner ring, placed on cell edges and repeated in the legend. |
| `map-monster`, `map-monster-dead` | Muted lilac group badges and pale rust dead groups, with a count, facing pointer and `x` for dead state. |
| `map-selection`, `map-hover` | Cell selection, spawn arrow, target links and pointer preview. |
| `warning`, `ready`, `danger` | Amber draft problems, sage ready status and pale rust errors, always with explanatory text. |
| `notice-*`, `error-*`, `warning-background` | Low-glare feedback surfaces with contrasting, hue-related text. |

The HTML legend and Canvas 2D drawing must continue to describe the same
floor/wall/void distinction. Do not indicate feature types, locked state or
validation results by colour alone.

Normal text should maintain at least 4.5:1 contrast; focus, control boundaries
and map markers at least 3:1 where they communicate state. Walls and floors
also have different fill/pattern treatments. Keep coordinate labels and the
compass backed by the dark canvas colour so panning a wall underneath does
not destroy their contrast. `color-scheme: dark` and the HTML colour-scheme
metadata keep browser-rendered controls and scrollbars from reverting to light.

## Typography

Use the system sans-serif stack throughout the interface. Monospace is for
coordinates, feature IDs, zoom values, code and shortcut hints, not general
labels. No web-font download is needed.

The hierarchy is deliberately tight: 16px app title, 14px panel headings,
13px subsection headings, and 11px/12px hints and compact controls. Normal
prose uses a 1.55 line height. The empty-state heading is 22px with slightly
tight tracking, reduced to 18px on the narrowest layout; it is not a hero.
Use sentence case and concise British English labels.

## Layout

The shell fills `100dvh`. The page itself does not scroll; tool and inspector
content can scroll independently while the canvas retains usable space.
The top bar contains product identity, level name, file/dirty status,
draft/readiness control, and New/Open/Save As/Save actions. More exposes
portable copy/download operations without crowding the normal workflow.

| Width | Structure |
| --- | --- |
| Above 1150px | Three columns: 140px tools, flexible canvas, 308px inspector. |
| 1150px and below | Tools reduce to 125px and inspector to 285px; extra tool-description text and shortcut hints disappear. |
| 850px and below | Two columns: 106px tools and canvas. Inspector becomes a right overlay with its own Close button. |
| 560px and below | Tools reduce to 77px, labels sit below icons, file/name information wraps, file actions get their own row and secondary hints are hidden. |

The desktop top bar has a 76px minimum height. The map has a compact 51px
toolbar above and a 31px status bar below. The canvas receives the remaining
space. Closely related controls use small gaps; sections are separated by
thin rules and roughly 16px to 24px of spacing, not nested cards.

Keep draft/readiness visible in the top bar even when the inspector is
closed or scrolled. The narrow inspector must be closable from inside itself;
it can cover the original toggle.

## Elevation & Depth

The editor is flat by default. Surface colour and 1px borders establish
hierarchy, with no shadows around ordinary fields or panels.

Existing shadows are reserved for actual overlays: the narrow inspector
uses `-6px 4px 20px var(--shadow)`, startup guidance uses
`0 8px 32px var(--shadow)`, and the confirmation dialog uses
`0 12px 50px var(--dialog-shadow)` over `var(--backdrop)`.
The native More popover uses `0 8px 24px var(--shadow)`. These are neutral
dark shadows, not amber glows.
There are no decorative CSS animations or transition sequences; editing
feedback is immediate.

## Shapes

Controls use small 5px rounded corners; the confirmation dialog uses 8px.
The map uses square cells and geometric markers. Existing inline SVG tool
icons have a consistent unfilled, rounded 1.65px stroke.

Do not replace the map's notation with asset thumbnails or introduce a
heavy icon library for simple tool symbols.

## Components

### Tools and buttons

Tool buttons retain both an icon and a text label. The current tool exposes
`aria-pressed`; the selected fill is distinct from hover. Rectangle is a
modifier for Floor/Wall/Erase, not another kind of cell.

Save is the primary action; Save As selects another target. More opens a native
popover containing Open a copy and Download JSON, with explanatory text.
Unsupported browsers label the primary action Download JSON rather than
pretending to support direct saving. New, Open, history and navigation controls
are quieter native buttons. General buttons have a 34px minimum height,
compact map controls 29px. Disabled controls show unavailable actions.
Destructive controls use an explicit label and restrained red text.

### Canvas and feature notation

Floor is charcoal, wall is muted stone-grey with hatching, and void is the
near-black grid background. The selected cell has a pale amber outline.
A pending stroke shows a translucent
preview without changing the document.

Doors are bars across a cell, rotated according to the passage axis. An
open door leaves a visible gap. Buttons are squares; torches are triangles.
Wall pillars are pale stone circles with an inner ring, distinct from the
numbered monster badges. They use the same edge positions and hit targets
as other wall features, and appear as Wall pillar in the legend.
Spawn is a directional pale amber arrow with a dark border.
Monster groups have a circular count badge towards the bottom-right of the
cell, with a cardinal facing pointer. An `x` after the count marks a dead
group; at small zoom levels it becomes a cross. Missing groups show `!`.
If spawn shares a monster cell, its arrow is smaller and sits towards the
top-left so both markers remain readable.
The legend explains group count/facing and dead state. Monster markers stay
separate from the environmental centre feature.
Only the selected button's action links are drawn as dashed amber connections,
so a level with many buttons does not become a permanent web of lines.

The empty-state hint teaches floor painting and sparse storage. It does not
intercept pointer input and disappears when the map is focused or populated.
Compass, coordinates and legend provide orientation without modal help.

### Inspector and fields

Start with coordinates and cell type, then player spawn, monster group and cell features.
Monster groups expose class, count (1 to 4), initial state and facing using
native selects. Their IDs remain secondary text. Explain that data is saved
but in-game spawning/combat is not connected yet.
Show the centre slot followed by North/East/South/West. Reveal detailed
properties for the active feature rather than every feature at once.
Pillar is offered only in cardinal wall slots. Its properties show the wall
direction and explain that it is decorative and not yet rendered by Game;
there are no height, radius or action-link controls.

Use labelled native inputs/selects. Show feature IDs as secondary information.
Link targets include their IDs and coordinates, with explicit order controls.
Supporting-wall and passage-axis wording must agree with the actual model.

### Feedback and protected operations

Notices explain success/failure and have a dismiss control. Draft problems
are accessible through the top-bar status and an expandable inspector list;
entries navigate to relevant content where possible. An unfinished draft is
not an exception or a reason to disable saving.

File operations show Opening/Saving states and prevent overlapping file
actions. A successful native write says Saved only after the stream closes.
Downloads are labelled as copy exports and never clear unsaved changes.
Cancellation and permission failure must not trigger a surprise download.
An external-edit conflict explains how to save a separate copy or reload,
without silently overwriting changes from another editor.

Native `<dialog>` confirmations protect removal of content or unsaved work.
State what will be removed, including affected features, incoming links and
spawn and monster groups. Routine feature/group editing stays inline, not in a modal.

### Keyboard and accessibility

Preserve visible `:focus-visible` outlines (2px amber with a 3px offset;
the canvas draws its focus outline inward), native form behaviour, labelled
controls and the textual selected-cell description.
Arrow keys and Enter support canvas selection/editing. Tool shortcuts must
not hijack typing into fields, and document shortcuts must respect modal
confirmation. Ctrl+S saves; Ctrl+Shift+S opens Save As; Ctrl+O opens JSON.
Suppress the browser's own Save Page shortcut even while a file operation
is busy. Rebuilding the inspector must retain usable keyboard focus.

## Do's and Don'ts

- **Do** keep the canvas dominant and the selected operation unambiguous.
- **Do** keep DOM controls, canvas notation and the legend consistent.
- **Do** use text and shape alongside colour for important state.
- **Do** preserve the desktop workflow when collapsing the layout.
- **Do** take colour cues from the game while keeping the tool visually quiet.
- **Do** keep large surfaces neutral and near-black; reserve warmth for accents
  rather than bringing back an overall brown tint.
- **Don't** introduce stone textures, parchment, ornamental frames, fantasy
  type or torch-glow effects. This is not a dungeon-themed interface.
- **Don't** restyle this editor as the game's retro HUD.
- **Don't** add a marketing header, dashboard cards or decorative animation.
- **Don't** hide draft problems or imply a download overwrote a game file.
- **Don't** invent supported gameplay through interface controls. Monster
  authoring maps to the real `WorldState.MonsterGroup`, but does not promise
  in-game spawning or combat. Items and other features still need real types.
