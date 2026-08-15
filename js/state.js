/* ---------- v3 STATE SHAPE AND MIGRATION ---------- */
// The whole page reads and writes one object:
//
//   { version: 3, tiles: [...], notes: [...], settings: {...} }
//
// Before v3, tiles and notes lived in chrome.storage.local while every setting lived in
// localStorage only, so clearing browser data dropped the settings and kept the tiles.
// Nothing here touches the DOM or the browser APIs, so the same file runs in a page, in a
// test, and in Node.

(function (root) {
  const STATE_VERSION = 3;

  // Where the v3 blob is stored, in both chrome.storage.local and localStorage.
  const STATE_KEY = "homebaseState";

  // The background image is deliberately not part of the state object. It is a data URL of
  // up to a few hundred KB with its own resize-and-fall-back persistence ladder, and
  // folding it in would rewrite it on every tile drag.
  const BACKGROUND_KEY = "customBackground";

  // Defaults match the values style.css already declares for the matching CSS variables, so
  // writing them out explicitly renders the same as leaving them unset did before.
  const DEFAULT_SETTINGS = {
    textColor: "#FFFFFF",
    tileColor: "rgba(255,255,255,0.4)",
    fontFamily: "'Roboto', sans-serif",
    // -1 and below means muted. 0.2 is what an untouched profile played at before v3.
    soundVolume: 0.2,
    tilePlacement: "top",
    // A count of pixels. The "px" is added where it is rendered, not where it is stored.
    tileBorderWidth: 0,
    showClock: true,
    clockColor: "#FFFFFF",
    clockFontFamily: "'Climate Crisis', cursive",
    clockFormat: "24",
    showSeconds: false,
    clockSize: 64,
    clockPosition: "left",
    atmosphereEffect: "none",
  };

  // Settings carried by v2 export files and by the pre-v3 localStorage keys, with the
  // reader that turns each stored string into its typed value.
  const SETTING_TYPES = {
    textColor: "text",
    tileColor: "text",
    fontFamily: "text",
    soundVolume: "number",
    tilePlacement: "text",
    tileBorderWidth: "length",
    showClock: "boolean",
    clockColor: "text",
    clockFontFamily: "text",
    clockFormat: "text",
    showSeconds: "boolean",
    clockSize: "number",
    clockPosition: "text",
    atmosphereEffect: "text",
  };

  // First-run markers and the changelog bookmark. They were never exported and are not
  // settings, so they stay where they are rather than moving into the state object.
  const FLAG_KEYS = [
    "hasSeenWelcome",
    "hasSeenPinInstructions",
    "hasCustomBackground",
    "homebase_changelog_version",
  ];

  function toText(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    return String(raw);
  }

  function toNumber(raw, fallback) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
    if (raw === null || raw === undefined || raw === "") return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  // Pre-v3 lengths were stored with their unit attached ("0px", "2px"), which is why the
  // old code compared them against the literal string "0px" instead of to zero.
  function toLength(raw, fallback) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;
    if (raw === null || raw === undefined || raw === "") return fallback;
    const n = parseFloat(String(raw));
    return Number.isFinite(n) ? n : fallback;
  }

  // Pre-v3 booleans were the strings "true" and "false". showClock defaulted to on and was
  // read as `!== "false"`; showSeconds defaulted to off and was read as `=== "true"`. Both
  // reduce to the same rule once a real boolean is on the other side.
  function toBoolean(raw, fallback) {
    if (typeof raw === "boolean") return raw;
    if (raw === null || raw === undefined || raw === "") return fallback;
    const s = String(raw).toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return fallback;
  }

  function coerceSetting(key, raw) {
    const fallback = DEFAULT_SETTINGS[key];
    switch (SETTING_TYPES[key]) {
      case "number":
        return toNumber(raw, fallback);
      case "length":
        return toLength(raw, fallback);
      case "boolean":
        return toBoolean(raw, fallback);
      default:
        return toText(raw, fallback);
    }
  }

  // Reads whatever is handed over, typed or not, and returns a complete settings object.
  function coerceSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const out = {};
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      out[key] = Object.prototype.hasOwnProperty.call(source, key)
        ? coerceSetting(key, source[key])
        : DEFAULT_SETTINGS[key];
    });
    return out;
  }

  function isFolder(item) {
    return !!item && item.type === "folder";
  }

  // A folder without a links array crashes the grid. One was never written, but an import
  // file is not something this code controls.
  function normalizeTiles(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        if (!isFolder(item)) return item;
        return Object.assign({}, item, {
          links: Array.isArray(item.links) ? item.links.filter(Boolean) : [],
        });
      });
  }

  function normalizeNotes(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((note) => note && typeof note === "object");
  }

  function createState(partial) {
    const source = partial && typeof partial === "object" ? partial : {};
    return {
      version: STATE_VERSION,
      tiles: normalizeTiles(source.tiles),
      notes: normalizeNotes(source.notes),
      settings: coerceSettings(source.settings),
    };
  }

  // True for anything that already looks like the v3 blob.
  function isStateV3(raw) {
    return !!raw && typeof raw === "object" && raw.version === STATE_VERSION;
  }

  // Builds v3 out of what the pre-v3 build left behind.
  //
  //   extension: the object chrome.storage.local returned (tiles, stickyNotes)
  //   legacy:    localStorage as a plain object of strings
  //
  // The precedence repeats what main.js did on load: extension tiles win when the array is
  // non-empty, extension notes win whenever the key is present at all (an empty array
  // counted), and settings only ever existed in localStorage.
  function migrateLegacy(sources) {
    const extension = (sources && sources.extension) || {};
    const legacy = (sources && sources.legacy) || {};

    const extensionTiles = Array.isArray(extension.tiles) ? extension.tiles : null;
    const tiles =
      extensionTiles && extensionTiles.length > 0
        ? extensionTiles
        : parseJson(legacy.tiles, []);

    const notes = Array.isArray(extension.stickyNotes)
      ? extension.stickyNotes
      : parseJson(legacy.stickyNotes, []);

    const settings = {};
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(legacy, key)) settings[key] = legacy[key];
    });

    return createState({ tiles, notes, settings });
  }

  function parseJson(raw, fallback) {
    if (typeof raw !== "string" || raw === "") return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  const api = {
    STATE_VERSION,
    STATE_KEY,
    BACKGROUND_KEY,
    DEFAULT_SETTINGS,
    SETTING_TYPES,
    FLAG_KEYS,
    coerceSettings,
    createState,
    isStateV3,
    isFolder,
    migrateLegacy,
    normalizeTiles,
    normalizeNotes,
    parseJson,
  };

  root.HomeBaseState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
