/* ---------- SYNC WITH THE LOCAL BRIDGE ---------- */
// Off unless the user turns it on. While it is off this file does not open a socket, does
// not fetch, and does not register anything, so the page behaves exactly as it does without
// a bridge at all.
//
// While it is on: read once at boot, write on a debounce after every change, and follow the
// event stream so a second tab sees the first one's edits.

(function (root) {
  const App = root.HomeBaseApp;
  const Persist = root.HomeBasePersist;
  const State = root.HomeBaseState;

  const BASE = "http://127.0.0.1:8787";
  const WRITE_DELAY = 600;

  let config = null;
  let stream = null;
  let writeTimer = null;
  // Set while a change is being applied that came from the bridge, so following it does not
  // bounce straight back as a write.
  let applyingRemote = false;
  let listening = false;

  function headers() {
    return { "content-type": "application/json", "X-HomeBase-Token": config.token };
  }

  function enabled() {
    return !!config && config.enabled && !!config.token;
  }

  /* ---------- READ ---------- */

  async function pull() {
    const res = await fetch(`${BASE}/state`, { headers: headers() });
    if (!res.ok) throw new Error(`bridge answered ${res.status}`);
    return res.json();
  }

  function applyRecord(record) {
    if (!record || !record.state || record.rev <= config.rev) return false;
    applyingRemote = true;
    try {
      App.commit(State.createState(record.state));
    } finally {
      applyingRemote = false;
    }
    config.rev = record.rev;
    Persist.saveSync({ rev: record.rev });
    return true;
  }

  /* ---------- WRITE ---------- */

  async function push() {
    const body = {
      rev: config.rev,
      updatedAt: new Date().toISOString(),
      state: App.getState(),
    };
    const res = await fetch(`${BASE}/state`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });

    // 409 means another writer got there first. Theirs is the newer one, so take it.
    if (res.status === 409) {
      applyRecord(await res.json());
      return;
    }
    if (!res.ok) throw new Error(`bridge answered ${res.status}`);

    const record = await res.json();
    config.rev = record.rev;
    await Persist.saveSync({ rev: record.rev });
  }

  function schedulePush() {
    if (!enabled() || applyingRemote) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      push().catch(quiet);
    }, WRITE_DELAY);
  }

  // A bridge that is not running is the normal case, not an error worth a dialog. The page
  // keeps working on its local state either way.
  function quiet(err) {
    console.debug("[homebase] bridge unavailable:", err && err.message);
  }

  /* ---------- EVENT STREAM ---------- */

  function openStream() {
    if (stream || !enabled()) return;
    // EventSource cannot set a header, so the token goes in the query. The bridge still
    // checks the Origin, which is what keeps a web page from reading this.
    stream = new EventSource(`${BASE}/events?token=${encodeURIComponent(config.token)}`);
    stream.onmessage = (event) => {
      try {
        applyRecord(JSON.parse(event.data));
      } catch (err) {
        quiet(err);
      }
    };
    stream.onerror = () => {
      // EventSource reconnects on its own; nothing to do but stop shouting about it.
    };
  }

  function closeStream() {
    if (!stream) return;
    stream.close();
    stream = null;
  }

  /* ---------- LIFECYCLE ---------- */

  async function start() {
    config = await Persist.loadSync();
    if (!enabled()) {
      closeStream();
      return;
    }

    if (!listening) {
      App.onChange(schedulePush);
      listening = true;
    }

    try {
      const record = await pull();
      // The bridge is ahead: take its state. Otherwise this tab has the newer one and the
      // bridge should be told.
      if (!applyRecord(record)) await push();
    } catch (err) {
      quiet(err);
    }

    openStream();
  }

  // Called when the settings modal saves, so a toggle takes effect without a reload.
  async function restart() {
    closeStream();
    clearTimeout(writeTimer);
    await start();
  }

  root.HomeBaseSync = { start, restart, isEnabled: () => enabled() };
})(window);
