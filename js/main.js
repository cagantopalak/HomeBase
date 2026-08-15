/* ---------- BOOT ---------- */
// Loads the state, hands it to the modules, and wires the few things that belong to the
// page as a whole rather than to any one of them.

(function (root) {
  const App = root.HomeBaseApp;
  const Persist = root.HomeBasePersist;
  const Tiles = root.HomeBaseTiles;
  const Notes = root.HomeBaseNotes;
  const Settings = root.HomeBaseSettings;
  const Clock = root.HomeBaseClock;
  const Wallpaper = root.HomeBaseWallpaper;
  const Menu = root.HomeBaseMenu;

  /* ---------- FIRST RUN ---------- */

  // Opens the browser's own extensions page so the user can pin the toolbar button.
  function openExtensionsPage() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
        return;
      }
    } catch (err) {
      // Falls through to the Firefox path.
    }
    try {
      if (typeof browser !== "undefined" && browser.tabs) {
        browser.tabs.create({ url: "about:addons" });
      }
    } catch (err) {
      console.warn("could not open the extensions page:", err && err.message);
    }
  }

  function showPinModal() {
    if (localStorage.getItem("hasSeenPinInstructions")) return;
    const modal = document.getElementById("pinModal");
    if (!modal) return;

    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    const openBtn = document.getElementById("openExtensionsBtn");
    const gotIt = document.getElementById("pinModalGotItBtn");
    if (openBtn) {
      openBtn.onclick = (e) => {
        e.preventDefault();
        openExtensionsPage();
      };
    }
    if (gotIt) {
      gotIt.onclick = (e) => {
        e.preventDefault();
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        localStorage.setItem("hasSeenPinInstructions", "true");
      };
    }
  }

  function showWelcomeModal() {
    if (localStorage.getItem("hasSeenWelcome")) return;
    const modal = document.getElementById("welcomeModal");
    const confirm = document.getElementById("welcomeConfirmBtn");
    if (!modal || !confirm) return;

    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    // The button unlocks after five seconds, so the text is not dismissed unread.
    confirm.disabled = true;
    confirm.style.opacity = "0.5";
    confirm.style.cursor = "not-allowed";

    const label = confirm.textContent;
    let left = 5;
    confirm.textContent = `${label} (${left}s)`;
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        confirm.textContent = `${label} (${left}s)`;
        return;
      }
      clearInterval(timer);
      confirm.textContent = label;
      confirm.disabled = false;
      confirm.style.opacity = "1";
      confirm.style.cursor = "pointer";
    }, 1000);

    confirm.addEventListener("click", () => {
      if (confirm.disabled) return;
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
      localStorage.setItem("hasSeenWelcome", "true");
      showPinModal();
    });
  }

  /* ---------- TOOLBAR ICON ---------- */

  // A dark toolbar wants the white icon set. Firefox can watch the media query from its
  // background script; a Chrome service worker has no window, so the page tells it.
  function updateBrowserIcon(theme) {
    const suffix = theme === "dark" ? "white" : "dark";
    const path = { 16: `icons/icon16${suffix}.png`, 32: `icons/icon32${suffix}.png` };

    try {
      if (typeof browser !== "undefined" && browser.browserAction && browser.browserAction.setIcon) {
        browser.browserAction.setIcon({ path });
      }
      // Reached through a string so Firefox's static analysis does not flag an MV3 API in
      // a file that also ships in the MV2 build.
      const action = typeof chrome !== "undefined" ? chrome["action"] : null;
      if (action && action.setIcon) {
        action.setIcon({ path });
      } else if (typeof chrome !== "undefined" && chrome.browserAction && chrome.browserAction.setIcon) {
        chrome.browserAction.setIcon({ path });
      }
    } catch (err) {
      console.warn("could not set the icon:", err && err.message);
    }

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "THEME_CHANGED", theme });
      }
    } catch (err) {
      // No background listener; the icon stays as it is.
    }
  }

  function watchTheme() {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = (e) => updateBrowserIcon(e.matches ? "dark" : "light");
    handle(media);
    media.addEventListener("change", handle);
  }

  /* ---------- PAGE LEVEL EVENTS ---------- */

  function initPageEvents() {
    // A right click on the page background offers the settings and sticky note buttons.
    // Anywhere else keeps its own menu.
    document.body.addEventListener("contextmenu", (e) => {
      const onOwnMenu =
        e.target.closest(".tile") ||
        e.target.closest(".add-tile") ||
        e.target.closest(".context-menu") ||
        e.target.closest(".modal") ||
        e.target.closest(".folder-bubble") ||
        e.target.closest("#new-digital-clock");
      if (onOwnMenu) {
        // Only the page menu goes away. The tile's own menu opened a moment ago, on the
        // way down to this handler.
        Menu.hidePageMenu();
        return;
      }
      e.preventDefault();
      Menu.showPageMenu(e.clientX, e.clientY);
    });

    // One Escape handler. Before v3 there were four, each closing a different subset.
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      Tiles.closeTileModal();
      Tiles.closeFolderModal();
      Tiles.closeFolder();
      Notes.closeNoteSettings();
      Settings.closeAllModals();
      Menu.hideAll();
    });
  }

  // The popup writes the same state object and then says so. Reload it rather than
  // guessing what changed.
  function listenForPopup() {
    const runtime =
      typeof browser !== "undefined" && browser.runtime
        ? browser.runtime
        : typeof chrome !== "undefined" && chrome.runtime
          ? chrome.runtime
          : null;
    if (!runtime || !runtime.onMessage) return;

    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.action !== "tileAdded") return;
      Persist.load()
        .then(({ state }) => App.adopt(state))
        .catch((err) => console.error("reload after popup failed:", err && err.message));
      sendResponse({ success: true });
    });
  }

  /* ---------- START ---------- */

  async function start() {
    // The background is read first and applied on its own, so the page does not show the
    // default image while the state is still loading.
    Wallpaper.restore();

    let loaded;
    try {
      loaded = await Persist.load();
    } catch (err) {
      console.error("state load failed, starting empty:", err && err.message);
      loaded = { state: root.HomeBaseState.createState({}), migrated: false };
    }

    Tiles.init();
    Notes.init();
    Settings.init();
    Wallpaper.init();

    App.adopt(loaded.state);
    const settings = App.getSettings();
    App.applyAppearance(settings);
    App.applyVolume(settings.soundVolume);
    Clock.apply(settings);
    Clock.start();
    if (root.effectManager) root.effectManager.setEffect(settings.atmosphereEffect);

    Tiles.render();
    Notes.render();

    initPageEvents();
    listenForPopup();
    watchTheme();
    showWelcomeModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
