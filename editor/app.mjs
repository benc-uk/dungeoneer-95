import {
  History, createLevel, serializeLevel, validateLevel, position, placements, monsterPlacements, key,
  paintCells, paintImpact, removalImpact, deleteFeatures, deleteMonsterGroups, setSpawn,
} from "./level.mjs";
import { MapCanvas } from "./canvas.mjs";
import { renderInspector } from "./inspector.mjs";
import { supportsNativeFiles, pickOpenFile, pickSaveFile, readFileText, writeFileText } from "./file-access.mjs";

const $ = (id) => document.getElementById(id);
const history = new History();
const nativeFiles = supportsNativeFiles();
const state = {
  tool: "floor", rectangle: false, selected: [0, 0], slot: "centre",
  filename: null, fileHandle: null, diskText: null, operation: null,
};
let savedText = serializeLevel(history.present);
let dirty = false;
const paintTools = ["floor", "wall", "void"];
const toolLabels = { select: ["Select", "Inspect cells and their features"], floor: ["Floor", "Draw rooms and corridors"],
  wall: ["Wall", "Build solid walls"], void: ["Erase", "Remove authored cells"], spawn: ["Player spawn", "Place on a floor cell"] };

function notify(message, error = false) {
  $("notice-text").textContent = message;
  $("notice").dataset.tone = error ? "error" : "info";
  $("notice").hidden = false;
}
function reportError(error) {
  console.error(error);
  notify(error instanceof Error ? error.message : String(error), true);
}
window.addEventListener("error", (event) => notify(`Editor error: ${event.message}`, true));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason));

const view = new MapCanvas($("map"), {
  level: () => history.present, tool: () => state.tool, rectangle: () => state.rectangle,
  select: selectCell, paint, spawn, error: reportError,
  hover: (pos) => { $("cursor").textContent = `X ${pos[0]}, Z ${pos[1]}`; },
  zoom: (text) => { $("zoom").textContent = text; },
});

function confirmChange(title, message, action) {
  const dialog = $("confirmation");
  if (dialog.open) return Promise.resolve(false);
  $("confirmation-title").textContent = title;
  $("confirmation-text").textContent = message;
  $("confirm-action").textContent = action;
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}

function change(operation) {
  try {
    const next = structuredClone(history.present);
    operation(next);
    const result = validateLevel(next);
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    if (history.commit(next)) render();
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
function impactText(impact) {
  return [
    impact.features ? `${impact.features} feature${impact.features === 1 ? "" : "s"} and all their placements` : "",
    impact.links ? `${impact.links} incoming action link${impact.links === 1 ? "" : "s"}` : "",
    impact.monsters ? `${impact.monsters} monster group${impact.monsters === 1 ? "" : "s"} and all their placements` : "",
    impact.spawn ? "the player spawn" : "",
  ].filter(Boolean).join(", ");
}
async function paint(points, type) {
  const impact = paintImpact(history.present, points, type);
  if (impact.features || impact.links || impact.spawn || impact.monsters) {
    if (!await confirmChange("Remove level content?", `This will remove ${impactText(impact)}.\n\nYou can undo the entire change.`, "Remove content")) return;
  }
  change((level) => paintCells(level, points, type));
}
async function removeFeature(id) {
  const impact = removalImpact(history.present, [id]);
  const description = impactText(impact) || `references to ${id}`;
  if (!await confirmChange(`Remove ${id}?`, `This will remove ${description}.\n\nYou can undo the entire change.`, "Remove feature")) return;
  change((level) => deleteFeatures(level, [id]));
}
async function removeMonster(id) {
  const impact = removalImpact(history.present, [], false, [id]);
  const description = impactText(impact) || `references to ${id}`;
  if (!await confirmChange(`Remove ${id}?`, `This will remove ${description}.\n\nYou can undo the entire change.`, "Remove group")) return;
  change((level) => deleteMonsterGroups(level, [id]));
}
function spawn(pos) { change((level) => setSpawn(level, pos)); }
function selectCell(pos, slot = "centre", reveal = false) {
  if (!position(pos)) { notify("Cell coordinates must be signed 32-bit integers.", true); return; }
  state.selected = pos.slice();
  state.slot = slot;
  view.selection = state.selected;
  view.slot = slot;
  if (reveal) view.reveal(pos);
  renderInspectorPanel();
  view.drawSoon();
}
function renderInspectorPanel() {
  const level = history.present;
  const cell = level.cells.get(key(state.selected));
  const monster = level.monsters.get(cell?.monster_group);
  $("selected-coordinates").textContent = `X ${state.selected[0]}, Z ${state.selected[1]}`;
  const monsterDescription = monster
    ? ` Skeleton warrior group: ${monster.count}, ${monster.state}, facing ${monster.facing}.`
    : cell?.monster_group ? ` Missing monster group ${cell.monster_group}.` : "";
  $("selection-description").textContent = `Cell ${key(state.selected)}: ${cell?.type ?? "empty space"}.${monsterDescription}`;
  renderInspector($("inspector-content"), level, state.selected, state.slot, {
    paint, spawn, change, select: selectCell, remove: removeFeature, removeMonster,
  });
}
function render() {
  const level = history.present;
  if (document.activeElement !== $("level-name")) $("level-name").value = level.name;
  renderFileStatus();
  $("undo").disabled = history.past.length === 0;
  $("redo").disabled = history.future.length === 0;
  $("empty-state").hidden = level.cells.size > 0;
  const walls = [...level.cells.values()].filter((cell) => cell.type === "wall").length;
  $("cell-count").textContent = `${level.cells.size} cells / ${level.cells.size - walls} floor / ${walls} wall`;
  const { problems } = validateLevel(level);
  $("problems").classList.toggle("ready", !problems.length);
  $("problem-summary").textContent = problems.length ? `Draft: ${problems.length} problem${problems.length === 1 ? "" : "s"}` : "Ready to play";
  $("show-problems").textContent = $("problem-summary").textContent;
  $("show-problems").classList.toggle("ready", !problems.length);
  $("problems").querySelector("p").textContent = problems.length
    ? "Drafts can be saved. Godot skips broken features, monster groups and links; a valid spawn is required."
    : nativeFiles
      ? "No level problems. Save the JSON file into the game's levels folder."
      : "No level problems. Download JSON and place the file in the game's levels folder.";
  $("problem-list").replaceChildren();
  const owners = placements(level);
  const monsterOwners = monsterPlacements(level);
  for (const problem of problems) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = problem.message;
    button.addEventListener("click", () => {
      const location = problem.monster_id ? monsterOwners.get(problem.monster_id) : problem.feature_id ? owners.get(problem.feature_id) : null;
      if (location || problem.pos) selectCell(location?.pos ?? problem.pos, location?.slot ?? "centre", true);
      else if (problem.monster_id) $("unplaced-monsters")?.scrollIntoView({ block: "nearest" });
      else if (problem.feature_id) $("unplaced-features")?.scrollIntoView({ block: "nearest" });
      else { setTool(level.cells.size ? "spawn" : "floor"); $("map").focus(); }
    });
    item.append(button); $("problem-list").append(item);
  }
  renderInspectorPanel();
  view.drawSoon();
}

function setTool(tool) {
  view.cancel();
  state.tool = tool;
  for (const button of document.querySelectorAll("[data-tool]")) button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  $("rectangle").disabled = !paintTools.includes(tool);
  $("shape-hint").textContent = state.rectangle && paintTools.includes(tool) ? "Drag a filled rectangle." : "Click and drag to paint.";
  const [label, help] = toolLabels[tool];
  $("tool-description").replaceChildren();
  const strong = document.createElement("strong"); strong.textContent = label;
  const span = document.createElement("span"); span.textContent = state.rectangle && paintTools.includes(tool) ? "Drag a filled rectangle" : help;
  $("tool-description").append(strong, span);
  $("map").style.cursor = tool === "select" ? "default" : "crosshair";
}
function renderFileStatus() {
  dirty = serializeLevel(history.present) !== savedText || $("level-name").value.trim() !== history.present.name;
  document.title = `${dirty ? "* " : ""}${history.present.name} | Level editor`;
  const activity = state.operation === "save" ? "Saving..." : dirty ? "Unsaved changes" : "No changes";
  $("save-status").textContent = `${state.filename ?? "New level"} / ${activity}`;
  $("save-status").title = state.fileHandle
    ? "Save writes back to the selected local file."
    : nativeFiles ? "No local file linked. Save will ask where to write." : "This browser uses JSON downloads, not direct file saving.";
  for (const id of ["new-file", "open-file", "save-file", "save-as", "import-file", "download-file"]) {
    $(id).disabled = state.operation !== null;
  }
  $("open-file").textContent = state.operation === "open" ? "Opening..." : "Open JSON";
  $("save-file").textContent = state.operation === "save" ? "Saving..." : nativeFiles ? "Save" : "Download JSON";
  $("save-file").title = nativeFiles ? "Save (Ctrl+S)" : "Download a JSON copy (Ctrl+S)";
  $("save-as").hidden = !nativeFiles;
  $("file-options-toggle").hidden = !nativeFiles;
  document.querySelector(".file-actions").setAttribute("aria-busy", String(state.operation !== null));
}
function setFileOperation(operation) {
  state.operation = operation;
  view.cancel();
  renderFileStatus();
}
function resetDocument(level, filename, handle = null, diskText = null) {
  view.cancel();
  history.reset(level);
  savedText = serializeLevel(level);
  state.filename = filename;
  state.fileHandle = handle;
  state.diskText = diskText;
  $("level-name").value = level.name;
  state.selected = level.player_start?.slice() ?? level.cells.values().next().value?.pos.slice() ?? [0, 0];
  state.slot = "centre";
  view.selection = state.selected;
  view.slot = state.slot;
  render();
  view.fit();
}

async function newFile() {
  if (state.operation || $("confirmation").open) return;
  if (dirty && !await confirmChange("Discard unsaved changes?", "Save or download the current level first if you want to keep your changes. Starting a new level clears its undo history.", "Discard and start new")) return;
  resetDocument(createLevel(), null);
}
async function acceptFile(text, filename, handle = null) {
  const level = createLevel(JSON.parse(text));
  if (dirty && !await confirmChange("Replace unsaved changes?", "Save or download the current level first if you want to keep your changes. Opening a file clears its undo history.", "Discard and open")) return;
  resetDocument(level, filename, handle, handle ? text : null);
  const count = validateLevel(level).problems.length;
  notify(`Opened ${filename}${handle ? ". Save writes back to this file." : " as a copy."}${count ? ` Draft has ${count} problem${count === 1 ? "" : "s"}.` : ""}`);
}
function nativeFileError(error, operation, name = "the selected file") {
  const recovery = error.name === "SecurityError"
    ? "Open the editor in a regular Edge or Chrome tab on localhost or HTTPS, or use More > Open a copy / Download JSON."
    : "Your work remains in the editor. You can use Save As or download a copy.";
  reportError(new Error(`Could not ${operation} ${name}.\n${error.message}\n${recovery}`, { cause: error }));
}
async function openNativeFile() {
  if (state.operation || $("confirmation").open) return;
  if (!nativeFiles) { importFile(); return; }
  setFileOperation("open");
  let filename;
  try {
    const handle = await pickOpenFile();
    if (!handle) return;
    filename = handle.name;
    await acceptFile(await readFileText(handle), filename, handle);
  } catch (error) {
    nativeFileError(error, "open", filename);
  } finally {
    setFileOperation(null);
  }
}
function hideFileOptions() {
  if ($("file-options").matches(":popover-open")) $("file-options").hidePopover();
}
function importFile() {
  if (state.operation || $("confirmation").open) return;
  hideFileOptions();
  $("file-input").value = "";
  $("file-input").click();
}
async function openFileCopy(file) {
  if (!file || state.operation) return;
  setFileOperation("open");
  try {
    await acceptFile(await file.text(), file.name);
  } catch (error) {
    reportError(new Error(`Could not open ${file.name}. Your current level is unchanged.\n${error.message}`, { cause: error }));
  } finally {
    setFileOperation(null);
  }
}
function suggestedFilename() {
  return state.filename ?? `${history.present.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "untitled"}.json`;
}
async function saveFile(saveAs = false) {
  if (state.operation || $("confirmation").open) return;
  if (!nativeFiles) { downloadFile(); return; }
  const level = history.present;
  const text = serializeLevel(level);
  let handle = state.fileHandle;
  let expectedText = state.diskText;
  setFileOperation("save");
  try {
    if (saveAs || !handle) {
      const selected = await pickSaveFile(suggestedFilename());
      if (!selected) return;
      const sameFile = handle && await selected.isSameEntry(handle);
      handle = selected;
      if (!sameFile) expectedText = await readFileText(handle);
    }
    await writeFileText(handle, text, expectedText);
    state.fileHandle = handle;
    state.filename = handle.name;
    state.diskText = text;
    savedText = text;
    const count = validateLevel(level).problems.length;
    notify(`Saved ${handle.name}.${count ? ` Draft still has ${count} authoring problem${count === 1 ? "" : "s"}.` : ""}`);
  } catch (error) {
    nativeFileError(error, "save", handle?.name);
  } finally {
    setFileOperation(null);
    render();
  }
}
function downloadFile() {
  if (state.operation || $("confirmation").open) return;
  hideFileOptions();
  const level = history.present;
  const text = serializeLevel(level);
  const filename = suggestedFilename();
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  const count = validateLevel(level).problems.length;
  notify(`Download requested: ${filename}. This exports a copy; it does not save the open file or clear unsaved changes.${count ? ` Draft has ${count} problem${count === 1 ? "" : "s"}.` : ""}`);
}

$("new-file").addEventListener("click", newFile);
$("open-file").addEventListener("click", openNativeFile);
$("file-input").addEventListener("change", () => openFileCopy($("file-input").files[0]));
$("save-file").addEventListener("click", () => saveFile());
$("save-as").addEventListener("click", () => saveFile(true));
$("import-file").addEventListener("click", importFile);
$("download-file").addEventListener("click", downloadFile);
$("file-options").addEventListener("beforetoggle", (event) => {
  if (event.newState !== "open") return;
  const bounds = $("file-options-toggle").getBoundingClientRect();
  $("file-options").style.top = `${bounds.bottom + 6}px`;
  $("file-options").style.right = `${document.documentElement.clientWidth - bounds.right}px`;
});
$("dismiss-notice").addEventListener("click", () => { $("notice").hidden = true; });
$("level-name").addEventListener("input", renderFileStatus);
$("level-name").addEventListener("change", () => {
  const value = $("level-name").value.trim();
  if (!value) { notify("Give the level a name before leaving this field.", true); $("level-name").value = history.present.name; renderFileStatus(); return; }
  change((level) => { level.name = value; });
});
for (const button of document.querySelectorAll("[data-tool]")) button.addEventListener("click", () => setTool(button.dataset.tool));
$("rectangle").addEventListener("click", () => {
  state.rectangle = !state.rectangle;
  $("rectangle").setAttribute("aria-pressed", String(state.rectangle));
  setTool(state.tool);
});
$("undo").addEventListener("click", () => { view.cancel(); if (history.undo()) render(); });
$("redo").addEventListener("click", () => { view.cancel(); if (history.redo()) render(); });
$("zoom-out").addEventListener("click", () => view.zoom(1 / 1.25));
$("zoom-in").addEventListener("click", () => view.zoom(1.25));
$("fit-map").addEventListener("click", () => view.fit());
$("toggle-inspector").addEventListener("click", () => {
  const open = $("inspector").classList.toggle("is-open");
  $("toggle-inspector").setAttribute("aria-expanded", String(open));
});
$("close-inspector").addEventListener("click", () => {
  $("inspector").classList.remove("is-open");
  $("toggle-inspector").setAttribute("aria-expanded", "false");
  $("toggle-inspector").focus();
});
$("show-problems").addEventListener("click", () => {
  $("inspector").classList.add("is-open");
  $("toggle-inspector").setAttribute("aria-expanded", "true");
  $("problems").open = true;
  $("problems").scrollIntoView({ block: "nearest" });
  $("problem-summary").focus();
});
window.addEventListener("beforeunload", (event) => {
  if (dirty || state.operation === "save") { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("keydown", (event) => {
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const editing = event.target.closest("input, select, textarea, [contenteditable='true']");
  if (command && ["s", "o"].includes(key)) {
    event.preventDefault();
    if ($("confirmation").open || state.operation) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    hideFileOptions();
    if (key === "s") saveFile(event.shiftKey); else $("open-file").click();
    return;
  }
  if ($("confirmation").open) return;
  if (editing || event.altKey) return;
  if (command && (key === "z" || key === "y")) {
    event.preventDefault();
    view.cancel();
    if ((key === "y" || event.shiftKey) ? history.redo() : history.undo()) render();
  } else if (!command) {
    const tool = { v: "select", f: "floor", w: "wall", e: "void", p: "spawn" }[key];
    if (tool) { event.preventDefault(); setTool(tool); }
    if (key === "r" && paintTools.includes(state.tool)) { event.preventDefault(); $("rectangle").click(); }
  }
});

$("startup").hidden = true;
setTool("floor");
render();
