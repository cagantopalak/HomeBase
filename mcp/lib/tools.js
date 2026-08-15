// The sixteen tools, each one a small wrapper over js/store.js and the bridge's state file.
//
// Reads take the current record. Writes read, apply a store function, and write back through
// the bridge, which broadcasts so an open tab redraws without being asked.

const Store = require("../../js/store.js");
const State = require("../../js/state.js");
const { assertLinkUrl, assertImageUrl } = require("./validate.js");

function pathOf(value, field = "path") {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new Error(`${field} must be [index] or [folderIndex, index]`);
  }
  value.forEach((n) => {
    if (!Number.isInteger(n) || n < 0) throw new Error(`${field} entries must be whole numbers`);
  });
  return value;
}

// A store function that returned the state it was given did nothing, which for these tools
// always means the arguments did not point at anything.
function changed(before, after, what) {
  if (before === after) throw new Error(`${what} matched nothing`);
  return after;
}

function summarise(state) {
  return {
    tiles: state.tiles.length,
    folders: state.tiles.filter(State.isFolder).length,
    notes: state.notes.length,
  };
}

function describeTile(tile, index) {
  if (State.isFolder(tile)) {
    return {
      index,
      type: "folder",
      name: tile.name,
      colorHex: tile.colorHex || null,
      links: tile.links.map((link, i) => ({ index: i, name: link.name, url: link.url })),
    };
  }
  return { index, type: "tile", name: tile.name, url: tile.url, icon: tile.icon || null };
}

function build(bridge) {
  const read = () => bridge.readState();
  const write = (state, background) => bridge.writeState(state, background);

  const tools = [];
  const add = (tool) => tools.push(tool);

  /* ---------- READING ---------- */

  add({
    name: "homebase_get_state",
    readOnly: true,
    description:
      "Return the whole HomeBase state: every tile and folder, every sticky note, and all settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const record = read();
      return { rev: record.rev, updatedAt: record.updatedAt, state: record.state };
    },
  });

  add({
    name: "homebase_list_tiles",
    readOnly: true,
    description:
      "List the tiles and folders on the new tab page, in display order, with the index each one is addressed by.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => read().state.tiles.map(describeTile),
  });

  add({
    name: "homebase_list_notes",
    readOnly: true,
    description: "List the sticky notes with their ids, titles and positions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () =>
      read().state.notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        x: note.x,
        y: note.y,
        width: note.width,
        height: note.height,
        paperColor: note.paperColor,
        isAnchored: !!note.isAnchored,
      })),
  });

  add({
    name: "homebase_get_settings",
    readOnly: true,
    description: "Return the settings: colours, fonts, clock, tile placement and the background effect.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => read().state.settings,
  });

  add({
    name: "homebase_export",
    readOnly: true,
    description:
      "Produce a backup file's contents. type 'full' covers everything, 'settings' only the settings, 'links' only the tiles and notes.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["full", "settings", "links"], default: "full" },
      },
      additionalProperties: false,
    },
    run: (args) => {
      const record = read();
      return Store.exportState(record.state, args.type || "full", {
        customBackground: record.background,
      });
    },
  });

  /* ---------- TILES ---------- */

  add({
    name: "homebase_add_tile",
    description: "Add a tile to the new tab page, at the end or into a folder.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The label under the tile." },
        url: { type: "string", description: "An http or https URL." },
        icon: { type: "string", description: "Optional image URL. A favicon is used when this is left out." },
        folderIndex: { type: "integer", minimum: 0, description: "Put it in this folder instead of at the top level." },
      },
      required: ["name", "url"],
      additionalProperties: false,
    },
    run: (args) => {
      const tile = { name: String(args.name), url: assertLinkUrl(args.url, "url") };
      if (args.icon) tile.icon = assertImageUrl(args.icon, "icon");

      const state = read().state;
      if (args.folderIndex !== undefined && !State.isFolder(state.tiles[args.folderIndex])) {
        throw new Error(`there is no folder at index ${args.folderIndex}`);
      }
      const next = changed(
        state,
        Store.addTile(state, tile, { folderIndex: args.folderIndex }),
        "add_tile"
      );
      write(next);
      return { added: tile, ...summarise(next) };
    },
  });

  add({
    name: "homebase_update_tile",
    description: "Change a tile's name, URL or icon. Only the fields given are touched.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "array",
          items: { type: "integer", minimum: 0 },
          description: "[index] for a top level tile, [folderIndex, index] for one inside a folder.",
        },
        name: { type: "string" },
        url: { type: "string" },
        icon: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    run: (args) => {
      const patch = {};
      if (args.name !== undefined) patch.name = String(args.name);
      if (args.url !== undefined) patch.url = assertLinkUrl(args.url, "url");
      if (args.icon !== undefined) patch.icon = assertImageUrl(args.icon, "icon");
      if (Object.keys(patch).length === 0) throw new Error("give at least one of name, url or icon");

      const state = read().state;
      const target = Store.getTile(state, pathOf(args.path));
      if (!target) throw new Error("path matched nothing");
      if (State.isFolder(target)) throw new Error("that is a folder; use homebase_update_tile on a tile");

      const next = changed(state, Store.updateTile(state, args.path, patch), "update_tile");
      write(next);
      return { updated: Store.getTile(next, args.path) };
    },
  });

  add({
    name: "homebase_remove_tile",
    description: "Remove a tile or a folder. Removing a folder removes what is inside it.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["path"],
      additionalProperties: false,
    },
    run: (args) => {
      const state = read().state;
      const target = Store.getTile(state, pathOf(args.path));
      if (!target) throw new Error("path matched nothing");
      const next = changed(state, Store.removeTile(state, args.path), "remove_tile");
      write(next);
      return { removed: describeTile(target, args.path[args.path.length - 1]), ...summarise(next) };
    },
  });

  add({
    name: "homebase_move_tile",
    description:
      "Move a tile to another position, including in or out of a folder. Both ends are paths.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "array", items: { type: "integer", minimum: 0 } },
        to: {
          type: "array",
          items: { type: "integer", minimum: 0 },
          description: "Where it should land, read against the list once the tile has been taken out.",
        },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
    run: (args) => {
      const state = read().state;
      if (!Store.getTile(state, pathOf(args.from, "from"))) throw new Error("from matched nothing");
      pathOf(args.to, "to");
      const next = changed(state, Store.moveTile(state, args.from, args.to), "move_tile");
      write(next);
      return { tiles: next.tiles.map(describeTile) };
    },
  });

  /* ---------- FOLDERS ---------- */

  add({
    name: "homebase_create_folder",
    description: "Create an empty folder at the end of the grid. Use homebase_move_to_folder to fill it.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    run: (args) => {
      const name = String(args.name).trim();
      if (!name) throw new Error("name is required");
      const state = read().state;
      const next = Store.addTile(state, { type: "folder", name, links: [] });
      write(next);
      return { created: name, index: next.tiles.length - 1 };
    },
  });

  add({
    name: "homebase_move_to_folder",
    description: "Move a tile into a folder. Folders cannot be nested.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "array", items: { type: "integer", minimum: 0 } },
        folderIndex: { type: "integer", minimum: 0 },
      },
      required: ["from", "folderIndex"],
      additionalProperties: false,
    },
    run: (args) => {
      const state = read().state;
      const tile = Store.getTile(state, pathOf(args.from, "from"));
      if (!tile) throw new Error("from matched nothing");
      if (State.isFolder(tile)) throw new Error("a folder cannot go inside a folder");
      if (!State.isFolder(state.tiles[args.folderIndex])) {
        throw new Error(`there is no folder at index ${args.folderIndex}`);
      }
      const next = changed(
        state,
        Store.moveIntoFolder(state, args.from, args.folderIndex),
        "move_to_folder"
      );
      write(next);
      return { tiles: next.tiles.map(describeTile) };
    },
  });

  /* ---------- NOTES ---------- */

  add({
    name: "homebase_create_note",
    description: "Put a sticky note on the new tab page.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", default: "Note" },
        content: { type: "string", description: "Plain text, or simple HTML as the note editor writes it." },
        x: { type: "integer", minimum: 0, default: 100 },
        y: { type: "integer", minimum: 0, default: 100 },
        paperColor: { type: "string", description: "A hex colour such as #FFF4BD." },
      },
      additionalProperties: false,
    },
    run: (args) => {
      const state = read().state;
      if (state.notes.length >= 15) throw new Error("there are already 15 notes, which is the limit");

      const note = {
        id: Date.now(),
        x: args.x === undefined ? 100 : args.x,
        y: args.y === undefined ? 100 : args.y,
        width: 220,
        height: 220,
        title: args.title === undefined ? "Note" : String(args.title),
        content: args.content === undefined ? "" : String(args.content),
        paperColor: args.paperColor || "#EDE0F5",
        textColor: "#000000",
        fontSize: 16,
        fontFamily: "'Roboto', sans-serif",
        zIndex: 1000 + state.notes.length,
      };
      const next = Store.addNote(state, note);
      write(next);
      return { created: { id: note.id, title: note.title }, notes: next.notes.length };
    },
  });

  add({
    name: "homebase_update_note",
    description: "Change a sticky note. Only the fields given are touched.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "From homebase_list_notes." },
        title: { type: "string" },
        content: { type: "string" },
        x: { type: "integer", minimum: 0 },
        y: { type: "integer", minimum: 0 },
        paperColor: { type: "string" },
        isAnchored: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: (args) => {
      const patch = {};
      ["title", "content", "x", "y", "paperColor", "isAnchored"].forEach((key) => {
        if (args[key] !== undefined) patch[key] = args[key];
      });
      if (Object.keys(patch).length === 0) throw new Error("give at least one field to change");

      const state = read().state;
      const next = changed(state, Store.updateNote(state, args.id, patch), `note ${args.id}`);
      write(next);
      return { updated: next.notes.find((n) => n.id === args.id) };
    },
  });

  /* ---------- SETTINGS AND BACKGROUND ---------- */

  add({
    name: "homebase_set_settings",
    description:
      "Change settings. Values are typed: showClock and showSeconds are booleans, soundVolume, clockSize and tileBorderWidth are numbers.",
    inputSchema: {
      type: "object",
      properties: {
        textColor: { type: "string" },
        tileColor: { type: "string" },
        fontFamily: { type: "string" },
        soundVolume: { type: "number", minimum: -1, maximum: 1 },
        tilePlacement: { type: "string", enum: ["top", "middle"] },
        tileBorderWidth: { type: "number", minimum: 0 },
        showClock: { type: "boolean" },
        clockColor: { type: "string" },
        clockFontFamily: { type: "string" },
        clockFormat: { type: "string", enum: ["12", "24"] },
        showSeconds: { type: "boolean" },
        clockSize: { type: "number", minimum: 1 },
        clockPosition: { type: "string", enum: ["left", "right"] },
        atmosphereEffect: {
          type: "string",
          enum: ["none", "snow", "rain", "leaves", "fireflies", "stars", "sakura"],
        },
      },
      additionalProperties: false,
    },
    run: (args) => {
      if (Object.keys(args).length === 0) throw new Error("give at least one setting");
      const state = read().state;
      const next = Store.setSettings(state, args);
      write(next);
      return next.settings;
    },
  });

  add({
    name: "homebase_set_background",
    description:
      "Set the background image. Takes an http or https URL, or a data:image/... URL. The page applies it the next time it hears from the bridge.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
    run: (args) => {
      const url = assertImageUrl(args.url, "url");
      const record = read();
      write(record.state, url);
      return { background: url.length > 80 ? url.slice(0, 80) + "..." : url };
    },
  });

  /* ---------- IMPORT ---------- */

  add({
    name: "homebase_import",
    description:
      "Replace the state from a backup file's contents. This overwrites tiles, notes and settings, so it will not run unless confirm is true.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "object", description: "The parsed contents of a v2 or v3 backup file." },
        confirm: {
          type: "boolean",
          description: "Must be true. Ask the user before setting it; this cannot be undone.",
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    run: (args) => {
      if (args.confirm !== true) {
        throw new Error(
          "homebase_import replaces the whole state and cannot be undone. Ask the user to confirm, then call again with confirm: true."
        );
      }
      const record = read();
      const result = Store.importState(args.file, record.state);
      if (!result.ok) throw new Error(`that file cannot be read: ${result.reason}`);

      write(result.state, result.customBackground || undefined);
      return { imported: result.type, carried: result.carried, ...summarise(result.state) };
    },
  });

  return tools;
}

module.exports = { build };
