import {
  DIRECTIONS, DOOR_STATES, DOOR_AXES, ACTIONS, WALL_FEATURE_TYPES, MONSTER_CLASSES, MONSTER_COUNTS, MONSTER_STATES,
  key, samePos, placements, monsterPlacements, addFeature, moveWallFeature, addMonsterGroup,
} from "./level.mjs";

const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
function node(tag, text = "", className = "") {
  const result = document.createElement(tag);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}
function button(text, action, id, className = "") {
  const result = node("button", text, className);
  result.type = "button";
  if (id) result.id = id;
  result.addEventListener("click", action);
  return result;
}
function select(id, label, choices, current, change) {
  const result = node("select");
  result.id = id;
  result.setAttribute("aria-label", label);
  for (const choice of choices) {
    const option = node("option", typeof choice === "string" ? title(choice) : choice.label);
    option.value = typeof choice === "string" ? choice : choice.value;
    option.disabled = typeof choice === "object" && Boolean(choice.disabled);
    result.append(option);
  }
  result.value = current;
  result.addEventListener("change", () => change(result.value));
  return result;
}
function field(label, control) {
  const result = node("label", "", "field");
  result.htmlFor = control.id;
  result.append(node("span", label), control);
  return result;
}
function section(label) {
  const result = node("section", "", "inspector-section");
  result.append(node("h3", label));
  return result;
}

export function renderInspector(container, level, pos, activeSlot, hooks) {
  const focused = container.contains(document.activeElement) ? document.activeElement.id : null;
  const scrollParent = container.parentElement;
  const scroll = scrollParent.scrollTop;
  container.replaceChildren();
  const cell = level.cells.get(key(pos));
  const owners = placements(level);
  const types = node("div", "", "segmented");
  types.setAttribute("role", "group");
  types.setAttribute("aria-label", "Cell type");
  for (const type of ["void", "floor", "wall"]) {
    const control = button(title(type), () => hooks.paint([pos], type), `cell-type-${type}`);
    control.setAttribute("aria-pressed", String((cell?.type ?? "void") === type));
    types.append(control);
  }
  container.append(types);

  const spawn = section("Player spawn");
  const spawnRow = node("div", "", "row");
  spawnRow.append(node("span", level.player_start ? `At ${key(level.player_start)}` : "Not placed", "hint"));
  if (level.player_start) {
    spawnRow.append(button("Show", () => hooks.select(level.player_start, "centre", true), "show-spawn"));
    spawnRow.append(button("Clear", () => hooks.change((next) => { next.player_start = null; }), "clear-spawn"));
  }
  spawn.append(spawnRow);
  const place = button(samePos(level.player_start, pos) ? "Spawn is here" : "Place spawn here", () => hooks.spawn(pos), "place-spawn");
  place.disabled = cell?.type !== "floor" || samePos(level.player_start, pos);
  spawn.append(place);
  spawn.append(field("Facing", select("spawn-facing", "Player facing", DIRECTIONS, level.player_start_face,
    (direction) => hooks.change((next) => { next.player_start_face = direction; }))));
  container.append(spawn);

  const monsters = section("Monster group");
  const monsterId = cell?.monster_group;
  const monster = level.monsters.get(monsterId);
  if (!monsterId) {
    const add = button("Add skeleton warriors", () => hooks.change((next) => addMonsterGroup(next, pos)), "add-monster");
    add.disabled = cell?.type !== "floor";
    monsters.append(add, node("p", "One group of 1 to 4 per floor cell, separate from its door and wall features.", "hint"));
  } else {
    const row = node("div", "", "row");
    row.append(node("span", monsterId, "feature-id"),
      button("Remove", () => hooks.removeMonster(monsterId), "remove-monster", "danger"));
    monsters.append(row);
    if (!monster) monsters.append(node("p", "This monster group is missing. Remove the reference to place a new group.", "hint"));
    else {
      monsters.append(field("Class", select("monster-class", "Monster class",
        MONSTER_CLASSES.map((value) => ({ value, label: "Skeleton warrior" })), monster.mon_class,
        (value) => hooks.change((next) => { next.monsters.get(monsterId).mon_class = value; }))));
      monsters.append(field("Count", select("monster-count", "Monster count", MONSTER_COUNTS.map(String), String(monster.count),
        (value) => hooks.change((next) => { next.monsters.get(monsterId).count = Number(value); }))));
      monsters.append(field("Initial state", select("monster-state", "Monster initial state", MONSTER_STATES, monster.state,
        (value) => hooks.change((next) => { next.monsters.get(monsterId).state = value; }))));
      monsters.append(field("Facing", select("monster-facing", "Monster facing", DIRECTIONS, monster.facing,
        (value) => hooks.change((next) => { next.monsters.get(monsterId).facing = value; }))));
    }
  }
  monsters.append(node("p", "Saved into WorldState. In-game spawning and combat are not connected yet.", "hint"));
  container.append(monsters);

  const slots = section("Cell features");
  if (cell?.type !== "floor") {
    slots.append(node("p", "Select or paint a floor cell to add a door, button, torch or pillar.", "hint"));
  } else {
    slots.append(node("p", "Wall features sit on this floor cell's edge, beside a supporting wall.", "hint"));
    for (const slot of ["centre", ...DIRECTIONS]) {
      const featureId = slot === "centre" ? cell.main_feature : cell.wall_features?.[slot];
      const feature = level.features.get(featureId);
      const row = node("div", "", "slot");
      const head = node("div", "", "slot-head");
      head.append(node("strong", slot === "centre" ? "Centre" : `${title(slot)} wall`));
      if (!featureId) {
        const choices = [{ value: "", label: "Add feature..." },
          ...(slot === "centre" ? ["door"] : WALL_FEATURE_TYPES)];
        head.append(select(`add-${slot}`, `Add feature to ${slot}`, choices, "", (type) => {
          if (!type) return;
          hooks.change((next) => addFeature(next, pos, slot, type));
          hooks.select(pos, slot);
        }));
      } else {
        head.append(button(feature ? title(feature.type) : "Missing", () => hooks.select(pos, slot), `edit-${slot}`));
        const remove = button("Remove", () => hooks.remove(featureId), `remove-${slot}`, "danger");
        remove.setAttribute("aria-label", `Remove ${featureId} from ${slot}`);
        head.append(remove);
      }
      row.append(head);
      if (featureId) row.append(node("p", featureId, "feature-id"));
      if (feature && slot === activeSlot) {
        const props = node("div", "", "feature-properties");
        if (slot !== "centre") {
          const directions = DIRECTIONS.map((direction) => ({ value: direction, label: title(direction),
            disabled: direction !== slot && Boolean(cell.wall_features?.[direction]) }));
          props.append(field("Wall", select("feature-wall", "Feature wall", directions, slot, (to) => {
            hooks.change((next) => moveWallFeature(next, pos, slot, to));
            hooks.select(pos, to);
          })));
        }
        if (feature.type === "door") {
          props.append(field("Initial state", select("door-state", "Door initial state", DOOR_STATES, feature.state,
            (value) => hooks.change((next) => { next.features.get(featureId).state = value; }))));
          props.append(field("Passage direction", select("door-axis", "Door passage direction",
            DOOR_AXES.map((axis) => ({ value: axis, label: axis === "north_south" ? "North / south" : "East / west" })), feature.axis,
            (value) => hooks.change((next) => { next.features.get(featureId).axis = value; }))));
        }
        if (feature.type === "pillar") {
          props.append(node("p", "Decorative wall feature. It does not block movement or support action links. Game rendering is not connected yet.", "hint"));
        }
        if (feature.type === "button") {
          const doors = [...level.features.values()].filter((candidate) => candidate.type === "door");
          const links = feature.action_links ?? [];
          for (const [index, link] of links.entries()) {
            const linkRow = node("div", "", "link-editor");
            const targets = doors.map((door) => ({ value: door.id,
              label: `${door.id}${owners.has(door.id) ? ` (${key(owners.get(door.id).pos)})` : " (unplaced)"}` }));
            if (!doors.some((door) => door.id === link.target_id)) targets.unshift({ value: link.target_id, label: `Invalid target: ${link.target_id}` });
            linkRow.append(field(`Target ${index + 1}`, select(`target-${index}`, `Target for action ${index + 1}`, targets, link.target_id,
              (value) => hooks.change((next) => { next.features.get(featureId).action_links[index].target_id = value; }))));
            linkRow.append(field("Action", select(`action-${index}`, `Action ${index + 1}`, ACTIONS, link.action,
              (value) => hooks.change((next) => { next.features.get(featureId).action_links[index].action = value; }))));
            const actions = node("div", "", "row link-actions");
            const move = (offset) => hooks.change((next) => {
              const ordered = next.features.get(featureId).action_links;
              [ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]];
            });
            const up = button("Up", () => move(-1), `link-up-${index}`);
            const down = button("Down", () => move(1), `link-down-${index}`);
            up.disabled = index === 0;
            down.disabled = index === links.length - 1;
            const show = button("Show", () => {
              const target = owners.get(link.target_id);
              if (target) hooks.select(target.pos, target.slot, true);
            }, `show-target-${index}`);
            show.disabled = !owners.has(link.target_id);
            actions.append(up, down, show, button("Remove", () => hooks.change((next) => {
              next.features.get(featureId).action_links.splice(index, 1);
            }), `remove-link-${index}`, "danger"));
            linkRow.append(actions);
            props.append(linkRow);
          }
          const add = button("Add action link", () => hooks.change((next) => {
            const target = next.features.get(featureId);
            target.action_links ??= [];
            target.action_links.push({ target_id: doors[0].id, action: "toggle" });
          }), "add-link", "small-button");
          add.disabled = !doors.length;
          props.append(add);
          if (!doors.length) props.append(node("p", "Add a door to the map before linking this button.", "hint"));
          else if (!links.length) props.append(node("p", "Add a link to open, close or toggle a door.", "hint"));
        } else if (feature.action_links?.length) {
          props.append(node("p", "Only buttons can trigger action links.", "hint"));
          props.append(button("Remove unsupported links", () => hooks.change((next) => {
            delete next.features.get(featureId).action_links;
          }), "clear-invalid-links", "small-button"));
        }
        row.append(props);
      }
      slots.append(row);
    }
  }
  container.append(slots);
  const unplaced = [...level.features.values()].filter((feature) => !owners.has(feature.id));
  if (unplaced.length) {
    const extras = section("Unplaced features");
    extras.id = "unplaced-features";
    extras.append(node("p", "These features have no cell. Remove any you no longer need.", "hint"));
    for (const feature of unplaced) {
      const row = node("div", "", "row");
      row.append(node("span", feature.id, "feature-id"), button("Remove", () => hooks.remove(feature.id), null, "danger small-button"));
      extras.append(row);
    }
    container.append(extras);
  }
  const monsterOwners = monsterPlacements(level);
  const unplacedMonsters = [...level.monsters.values()].filter((group) => !monsterOwners.has(group.id));
  if (unplacedMonsters.length) {
    const extras = section("Unplaced monster groups");
    extras.id = "unplaced-monsters";
    extras.append(node("p", "These groups have no cell. Remove any you no longer need.", "hint"));
    for (const group of unplacedMonsters) {
      const row = node("div", "", "row");
      row.append(node("span", group.id, "feature-id"),
        button("Remove", () => hooks.removeMonster(group.id), null, "danger small-button"));
      extras.append(row);
    }
    container.append(extras);
  }
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  scrollParent.scrollTop = scroll;
}
