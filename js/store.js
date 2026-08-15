/* ---------- STORE ---------- */
// Every operation the page performs on tiles, folders, notes and settings, as functions
// that take a state and return a new one. Nothing here reads the DOM, touches a browser
// API or persists anything, so a caller can apply an operation, compare the result and
// decide what to redraw.
//
// Tiles are addressed by path: [index] for a top level tile, [folderIndex, index] for one
// inside a folder. The pre-v3 code carried the same two cases as two separate sets of
// handlers and a pair of module level cursors.

(function (root) {
  const State = root.HomeBaseState || (typeof require === "function" ? require("./state.js") : null);
  if (!State) throw new Error("store.js needs state.js");

  function cloneState(state) {
    return {
      version: State.STATE_VERSION,
      tiles: state.tiles.slice(),
      notes: state.notes.slice(),
      settings: Object.assign({}, state.settings),
    };
  }

  function isIndex(value, length) {
    return Number.isInteger(value) && value >= 0 && value < length;
  }

  // Resolves a path to the array that holds the tile and the position within it, or null
  // when the path does not point at anything.
  function locate(state, path) {
    if (!Array.isArray(path) || path.length === 0) return null;
    if (path.length === 1) {
      if (!isIndex(path[0], state.tiles.length)) return null;
      return { parent: null, list: state.tiles, index: path[0] };
    }
    const folder = state.tiles[path[0]];
    if (!State.isFolder(folder)) return null;
    if (!isIndex(path[1], folder.links.length)) return null;
    return { parent: path[0], list: folder.links, index: path[1] };
  }

  function getTile(state, path) {
    const spot = locate(state, path);
    return spot ? spot.list[spot.index] : null;
  }

  // Returns a state whose folder at `index` has had its links array replaced.
  function withFolderLinks(state, index, links) {
    const next = cloneState(state);
    next.tiles[index] = Object.assign({}, next.tiles[index], { links });
    return next;
  }

  /* ---------- TILES ---------- */

  // Appends to the top level, or into a folder when folderIndex is a number. Matches the
  // popup, which appends rather than inserting.
  function addTile(state, tile, options) {
    const opts = options || {};
    if (typeof opts.folderIndex === "number") {
      const folder = state.tiles[opts.folderIndex];
      if (!State.isFolder(folder)) return state;
      return withFolderLinks(state, opts.folderIndex, folder.links.concat([tile]));
    }
    const next = cloneState(state);
    if (typeof opts.index === "number" && opts.index >= 0 && opts.index <= next.tiles.length) {
      next.tiles.splice(opts.index, 0, tile);
    } else {
      next.tiles.push(tile);
    }
    return next;
  }

  // Merges `patch` over the tile at `path`. A folder keeps its links unless the patch
  // names them, so renaming a folder cannot drop its contents.
  function updateTile(state, path, patch) {
    const spot = locate(state, path);
    if (!spot) return state;
    const merged = Object.assign({}, spot.list[spot.index], patch);
    if (spot.parent === null) {
      const next = cloneState(state);
      next.tiles[spot.index] = merged;
      return next;
    }
    const links = spot.list.slice();
    links[spot.index] = merged;
    return withFolderLinks(state, spot.parent, links);
  }

  // Replaces the tile at `path` outright. The edit modal rewrites a tile rather than
  // patching it, which is how a tile loses an icon it no longer needs.
  function replaceTile(state, path, tile) {
    const spot = locate(state, path);
    if (!spot) return state;
    if (spot.parent === null) {
      const next = cloneState(state);
      next.tiles[spot.index] = tile;
      return next;
    }
    const links = spot.list.slice();
    links[spot.index] = tile;
    return withFolderLinks(state, spot.parent, links);
  }

  function removeTile(state, path) {
    const spot = locate(state, path);
    if (!spot) return state;
    if (spot.parent === null) {
      const next = cloneState(state);
      next.tiles.splice(spot.index, 1);
      return next;
    }
    const links = spot.list.slice();
    links.splice(spot.index, 1);
    return withFolderLinks(state, spot.parent, links);
  }

  // Moves a tile between any two positions, including in and out of folders. When `to` is
  // a one element path the tile lands at that index of the top level; the source is
  // removed first, so the target index is read against the shortened array exactly as the
  // splice pair it replaces did.
  function moveTile(state, from, to) {
    const spot = locate(state, from);
    if (!spot) return state;
    const tile = spot.list[spot.index];
    if (!tile) return state;

    const removed = removeTile(state, from);
    if (removed === state) return state;

    const target = to.slice();

    if (target.length === 1) {
      // Read against the shortened array, which is what the splice pair this replaces did:
      // remove at `from`, then insert at `to`.
      const next = cloneState(removed);
      const at = Math.max(0, Math.min(target[0], next.tiles.length));
      next.tiles.splice(at, 0, tile);
      return next;
    }

    // Removing a top level tile that sat before the target folder shifts the folder down.
    if (spot.parent === null && target[0] > spot.index) target[0] -= 1;

    const folder = removed.tiles[target[0]];
    if (!State.isFolder(folder)) return state;
    const links = folder.links.slice();
    const at = Math.max(0, Math.min(target[1], links.length));
    links.splice(at, 0, tile);
    return withFolderLinks(removed, target[0], links);
  }

  /* ---------- FOLDERS ---------- */

  // Dropping one top level tile onto another. The new folder takes the target's position
  // and holds [target, source] in that order, which is what the drop handler produced.
  function createFolder(state, sourceIndex, targetIndex, name) {
    if (sourceIndex === targetIndex) return state;
    if (!isIndex(sourceIndex, state.tiles.length)) return state;
    if (!isIndex(targetIndex, state.tiles.length)) return state;

    const source = state.tiles[sourceIndex];
    const target = state.tiles[targetIndex];
    if (State.isFolder(source) || State.isFolder(target)) return state;

    const folder = {
      type: "folder",
      name: name || "Folder",
      links: [target, source],
    };

    const next = cloneState(state);
    next.tiles[targetIndex] = folder;
    next.tiles.splice(sourceIndex, 1);
    return next;
  }

  // Folders do not nest, so a folder dragged onto a folder is refused rather than merged.
  function moveIntoFolder(state, from, folderIndex) {
    const tile = getTile(state, from);
    if (!tile || State.isFolder(tile)) return state;
    const folder = state.tiles[folderIndex];
    if (!State.isFolder(folder)) return state;
    if (from.length === 1 && from[0] === folderIndex) return state;
    return moveTile(state, from, [folderIndex, folder.links.length]);
  }

  function renameFolder(state, folderIndex, name) {
    const folder = state.tiles[folderIndex];
    if (!State.isFolder(folder) || !name) return state;
    return updateTile(state, [folderIndex], { name });
  }

  function setFolderColor(state, folderIndex, colorHex) {
    const folder = state.tiles[folderIndex];
    if (!State.isFolder(folder)) return state;
    const next = cloneState(state);
    const copy = Object.assign({}, folder);
    if (colorHex) copy.colorHex = colorHex;
    else delete copy.colorHex;
    next.tiles[folderIndex] = copy;
    return next;
  }

  // Used by the reset-colours action, which drops every per-folder override at once.
  function clearFolderColors(state) {
    const next = cloneState(state);
    next.tiles = next.tiles.map((item) => {
      if (!State.isFolder(item) || !item.colorHex) return item;
      const copy = Object.assign({}, item);
      delete copy.colorHex;
      return copy;
    });
    return next;
  }

  /* ---------- NOTES ---------- */

  function addNote(state, note) {
    const next = cloneState(state);
    next.notes.push(note);
    return next;
  }

  function updateNote(state, id, patch) {
    const at = state.notes.findIndex((note) => note.id === id);
    if (at === -1) return state;
    const next = cloneState(state);
    next.notes[at] = Object.assign({}, next.notes[at], patch);
    return next;
  }

  function removeNote(state, id) {
    const at = state.notes.findIndex((note) => note.id === id);
    if (at === -1) return state;
    const next = cloneState(state);
    next.notes.splice(at, 1);
    return next;
  }

  /* ---------- SETTINGS ---------- */

  function getSettings(state) {
    return Object.assign({}, state.settings);
  }

  function setSettings(state, patch) {
    const next = cloneState(state);
    next.settings = State.coerceSettings(Object.assign({}, state.settings, patch));
    return next;
  }

  function resetSettings(state) {
    const next = cloneState(state);
    next.settings = State.coerceSettings({});
    return next;
  }

  /* ---------- EXPORT AND IMPORT ---------- */

  // Three shapes, as before, now at version 3 and with the payload under a name rather
  // than under `data`. `customBackground` rides at the top level instead of inside
  // settings, because it is not a setting the page reads through getSettings.
  function exportState(state, type, options) {
    const opts = options || {};
    const background = opts.customBackground || null;

    if (type === "settings") {
      const out = { version: State.STATE_VERSION, type: "settings", settings: getSettings(state) };
      if (background) out.customBackground = background;
      return out;
    }
    if (type === "links") {
      return {
        version: State.STATE_VERSION,
        type: "links",
        tiles: state.tiles,
        notes: state.notes,
      };
    }
    const out = {
      version: State.STATE_VERSION,
      type: "full",
      tiles: state.tiles,
      notes: state.notes,
      settings: getSettings(state),
    };
    if (background) out.customBackground = background;
    return out;
  }

  // Reads a v3 file and a v2 file alike, and reports what the file actually carried so the
  // caller does not overwrite tiles from a settings-only backup.
  //
  // v2 put tiles under `tiles` for a full backup but under `data` for a links backup, put
  // settings under `settings` for a full backup and under `data` for a settings backup,
  // and always put notes under `stickyNotes`.
  function importState(file, current) {
    const base = current || State.createState({});
    if (!file || typeof file !== "object" || !file.type || !file.version) {
      return { ok: false, reason: "missing type or version" };
    }

    const type = file.type;
    if (type !== "full" && type !== "settings" && type !== "links") {
      return { ok: false, reason: "unknown type" };
    }

    const isV3 = file.version >= State.STATE_VERSION;
    const carried = { tiles: false, notes: false, settings: false, background: false };

    let tiles = base.tiles;
    let notes = base.notes;
    let settings = base.settings;

    if (type === "full" || type === "links") {
      const rawTiles = type === "links" && !isV3 ? file.data : file.tiles;
      if (Array.isArray(rawTiles)) {
        tiles = State.normalizeTiles(rawTiles);
        carried.tiles = true;
      }
      const rawNotes = isV3 ? file.notes : file.stickyNotes;
      if (Array.isArray(rawNotes)) {
        notes = State.normalizeNotes(rawNotes);
        carried.notes = true;
      }
    }

    if (type === "full" || type === "settings") {
      const rawSettings = isV3
        ? file.settings
        : type === "settings"
          ? file.data
          : file.settings;
      if (rawSettings && typeof rawSettings === "object") {
        settings = State.coerceSettings(Object.assign({}, base.settings, rawSettings));
        carried.settings = true;
      }
    }

    // v2 kept the background inside the settings block; v3 keeps it beside them.
    let customBackground = null;
    const rawSettingsForBackground = isV3
      ? null
      : type === "settings"
        ? file.data
        : file.settings;
    if (isV3 && file.customBackground) customBackground = file.customBackground;
    else if (rawSettingsForBackground && rawSettingsForBackground.customBackground) {
      customBackground = rawSettingsForBackground.customBackground;
    }
    if (customBackground) carried.background = true;

    return {
      ok: true,
      type,
      carried,
      customBackground,
      state: { version: State.STATE_VERSION, tiles, notes, settings },
    };
  }

  const api = {
    cloneState,
    locate,
    getTile,
    addTile,
    updateTile,
    replaceTile,
    removeTile,
    moveTile,
    createFolder,
    moveIntoFolder,
    renameFolder,
    setFolderColor,
    clearFolderColors,
    addNote,
    updateNote,
    removeNote,
    getSettings,
    setSettings,
    resetSettings,
    exportState,
    importState,
  };

  root.HomeBaseStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
