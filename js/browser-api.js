/* ---------- browser.* ON TOP OF chrome.* ---------- */
// Firefox exposes promise-returning browser.* APIs; Chrome exposes callback-style chrome.*
// ones. The rest of the extension is written against browser.*, so this file fills it in
// when only chrome.* is there. It has to run before anything reads storage.
//
// js/mock-extension.js runs earlier still and builds a chrome.* stand-in out of nothing
// when the page is opened outside an extension, so under file:// this wraps the mock.

(function () {
  if (typeof browser !== "undefined" || typeof chrome === "undefined") return;

  const target = typeof window !== "undefined" ? window : globalThis;
  const api = {};

  function lastError() {
    try {
      return chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
    } catch (err) {
      return null;
    }
  }

  function promisify(fn) {
    return (...args) =>
      new Promise((resolve, reject) => {
        fn(...args, (result) => {
          const err = lastError();
          if (err) return reject(new Error(err.message || String(err)));
          resolve(result);
        });
      });
  }

  api.storage = {
    local: {
      get: promisify((keys, cb) => chrome.storage.local.get(keys, cb)),
      set: promisify((obj, cb) => chrome.storage.local.set(obj, cb)),
      remove: promisify((key, cb) => chrome.storage.local.remove(key, cb)),
      clear: promisify((cb) => chrome.storage.local.clear(cb)),
    },
  };

  api.tabs = {
    query: (queryInfo) => new Promise((resolve) => chrome.tabs.query(queryInfo, resolve)),
    create: (props) => new Promise((resolve) => chrome.tabs.create(props, resolve)),
  };

  api.runtime = {
    sendMessage: (msg) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = lastError();
          if (err) {
            // Routine when no page is listening, for instance the popup posting to a
            // newtab that is not open. Not an error worth rejecting on.
            const text = String(err.message || err);
            if (text.includes("message port closed")) return resolve(undefined);
            return reject(new Error(text));
          }
          resolve(res);
        });
      }),
    onMessage: chrome.runtime.onMessage,
    getURL: chrome.runtime.getURL ? chrome.runtime.getURL.bind(chrome.runtime) : (p) => p,
  };

  target.browser = api;
})();
