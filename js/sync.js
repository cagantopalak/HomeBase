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

  // How long to wait before trying the event stream again after it fails, doubling each
  // time, and how many times to bother. A bridge that is not running is the ordinary case,
  // and the browser logs every failed attempt itself, so this gives up rather than leaving
  // a line in the console every minute for as long as the tab is open. A write that gets
  // through reopens it, and so does reloading, which covers the bridge being started later.
  const FIRST_RETRY_DELAY = 5000;
  const MAX_RETRIES = 3;

  let config = null;
  let stream = null;
  let writeTimer = null;
  let retryTimer = null;
  let streamAttempts = 0;
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

    // A write that got through means the bridge is back, so stop waiting out the backoff.
    if (!stream) {
      streamAttempts = 0;
      openStream();
    }
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

    stream.onopen = () => {
      streamAttempts = 0;
    };

    stream.onmessage = (event) => {
      try {
        applyRecord(JSON.parse(event.data));
      } catch (err) {
        quiet(err);
      }
    };

    stream.onerror = () => {
      // Left alone, EventSource reconnects every few seconds forever, and the browser logs
      // every failed attempt itself, which no handler here can suppress. A bridge that is
      // simply not running would then fill the console and keep a request in flight for as
      // long as the tab is open. Close it and come back later instead.
      closeStream();
      if (!enabled() || streamAttempts >= MAX_RETRIES) return;
      const delay = FIRST_RETRY_DELAY * 2 ** streamAttempts;
      streamAttempts += 1;
      retryTimer = setTimeout(openStream, delay);
    };
  }

  function closeStream() {
    clearTimeout(retryTimer);
    retryTimer = null;
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
    streamAttempts = 0;
    await start();
  }

  root.HomeBaseSync = { start, restart, isEnabled: () => enabled() };
})(window);
