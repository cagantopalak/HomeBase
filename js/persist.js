/* ---------- THE ONE PLACE STATE IS READ AND WRITTEN ---------- */
// Before v3 there were four writers: persist() for tiles, saveStickyNotes() for notes,
// a scattering of localStorage.setItem calls for settings, and the popup writing tiles
// straight into chrome.storage.local. They disagreed about which store was authoritative.
//
// Now the whole state goes through save(), which mirrors it into chrome.storage.local and
// localStorage on every write. The mirror is what makes settings survive a browser data
// clear, and what lets the popup and the newtab page see the same thing.

(function (root) {
  const State = root.HomeBaseState;
  if (!State) throw new Error("persist.js needs state.js");

  function hasExtensionStorage() {
    return typeof browser !== "undefined" && !!browser.storage;
  }

  function readLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      // Quota, or localStorage blocked under file://. The extension store still has it.
      console.warn("localStorage write failed for", key, err && err.message);
      return false;
    }
  }

  // Everything in localStorage as a plain object, which is what migration wants.
  function snapshotLocalStorage() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) out[key] = localStorage.getItem(key);
      }
    } catch (err) {
      // Nothing readable; migration falls back to defaults.
    }
    return out;
  }

  async function readExtension(keys) {
    if (!hasExtensionStorage()) return {};
    try {
      return (await browser.storage.local.get(keys)) || {};
    } catch (err) {
      console.warn("chrome.storage read failed:", err && err.message);
      return {};
    }
  }

  // Loads v3 if it is there, otherwise builds it from the pre-v3 keys and writes it once.
  //
  // The pre-v3 keys are left in place. They are the way back to an older build for one
  // release; nothing reads them again once v3 exists.
  async function load() {
    const extension = await readExtension([State.STATE_KEY, "tiles", "stickyNotes"]);

    let stored = extension[State.STATE_KEY];
    if (!stored) stored = State.parseJson(readLocalStorage(State.STATE_KEY), null);

    if (State.isStateV3(stored)) {
      return { state: State.createState(stored), migrated: false };
    }

    const state = State.migrateLegacy({
      extension,
      legacy: snapshotLocalStorage(),
    });
    await save(state);
    return { state, migrated: true };
  }

  // The single write path. Both stores get the same object.
  async function save(state) {
    const payload = State.createState(state);
    const serialized = JSON.stringify(payload);

    writeLocalStorage(State.STATE_KEY, serialized);

    if (hasExtensionStorage()) {
      try {
        await browser.storage.local.set({ [State.STATE_KEY]: payload });
      } catch (err) {
        console.error("chrome.storage write failed:", err && err.message);
      }
    }
    return payload;
  }

  /* ---------- THE BACKGROUND IMAGE ---------- */
  // Kept out of the state blob and out of save(), because it is a data URL of up to a few
  // hundred KB and it changes far less often than a tile position.

  const SIZE_LIMIT = 150 * 1024;

  async function loadBackground() {
    const extension = await readExtension(State.BACKGROUND_KEY);
    return (
      extension[State.BACKGROUND_KEY] ||
      sessionStorage.getItem("sessionCustomBackground") ||
      readLocalStorage(State.BACKGROUND_KEY) ||
      null
    );
  }

  // Tries the extension store, then localStorage, then the session. Returns where it
  // landed so the caller can tell the user when the image will not outlive the tab.
  async function saveBackground(dataUrl, resize) {
    if (!dataUrl) return "none";

    let toSave = dataUrl;
    if (dataUrl.length >= SIZE_LIMIT && typeof resize === "function") {
      try {
        toSave = await resize(dataUrl);
      } catch (err) {
        console.warn("background resize failed:", err && err.message);
      }
    }

    if (hasExtensionStorage()) {
      try {
        await browser.storage.local.set({ [State.BACKGROUND_KEY]: toSave });
        writeLocalStorage("hasCustomBackground", "true");
        return "extension";
      } catch (err) {
        console.warn("background did not fit chrome.storage:", err && err.message);
      }
    }

    if (toSave.length < SIZE_LIMIT && writeLocalStorage(State.BACKGROUND_KEY, toSave)) {
      return "local";
    }

    try {
      sessionStorage.setItem("sessionCustomBackground", toSave);
      return "session";
    } catch (err) {
      console.error("background could not be stored at all:", err && err.message);
      return "none";
    }
  }

  async function clearBackground() {
    if (hasExtensionStorage()) {
      try {
        await browser.storage.local.remove(State.BACKGROUND_KEY);
      } catch (err) {
        console.warn("background remove failed:", err && err.message);
      }
    }
    try {
      localStorage.removeItem(State.BACKGROUND_KEY);
      localStorage.removeItem("hasCustomBackground");
      sessionStorage.removeItem("sessionCustomBackground");
    } catch (err) {
      // Nothing to do; the extension store is the one that matters.
    }
  }

  /* ---------- SYNC SETTINGS ---------- */
  // Deliberately not part of the state object. The bridge round-trips the state, so a
  // machine that had sync off would hand its `enabled: false` to a machine that had it on,
  // and the second machine would switch itself off.

  const SYNC_KEY = "homebaseSync";
  const SYNC_DEFAULTS = { enabled: false, token: "", rev: 0 };

  async function loadSync() {
    const extension = await readExtension(SYNC_KEY);
    const stored =
      extension[SYNC_KEY] || State.parseJson(readLocalStorage(SYNC_KEY), null) || {};
    return {
      enabled: stored.enabled === true,
      token: typeof stored.token === "string" ? stored.token : "",
      rev: Number.isInteger(stored.rev) && stored.rev >= 0 ? stored.rev : 0,
    };
  }

  async function saveSync(patch) {
    const next = Object.assign(await loadSync(), patch);
    writeLocalStorage(SYNC_KEY, JSON.stringify(next));
    if (hasExtensionStorage()) {
      try {
        await browser.storage.local.set({ [SYNC_KEY]: next });
      } catch (err) {
        console.error("sync settings write failed:", err && err.message);
      }
    }
    return next;
  }

  /* ---------- RESET ---------- */

  // Drops the v3 blob and the pre-v3 keys alike. Used by the reset actions, which the user
  // reaches through a confirmation and which end in a reload.
  async function clearAll() {
    if (hasExtensionStorage()) {
      try {
        await browser.storage.local.clear();
      } catch (err) {
        console.warn("chrome.storage clear failed:", err && err.message);
      }
    }
    try {
      localStorage.clear();
    } catch (err) {
      // Ignore; the extension store is cleared either way.
    }
  }

  const api = {
    load,
    save,
    loadBackground,
    saveBackground,
    clearBackground,
    clearAll,
    hasExtensionStorage,
    snapshotLocalStorage,
    loadSync,
    saveSync,
    SYNC_DEFAULTS,
  };

  root.HomeBasePersist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
