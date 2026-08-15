/* ---------- APPLICATION CORE ---------- */
// Holds the one live state object, hands it to whoever asks, and writes it through
// persist.js when it changes. Also the handful of things every other module needs: the
// colour conversions, the alert and confirm dialogs, and the click and hover tones.

(function (root) {
  const State = root.HomeBaseState;
  const Persist = root.HomeBasePersist;

  let state = State.createState({});
  const listeners = [];

  function getState() {
    return state;
  }

  function getSettings() {
    return state.settings;
  }

  // Replaces the state without writing it. Used once, at boot, after load().
  function adopt(next) {
    state = State.createState(next);
    notify();
  }

  // The only way the page changes anything. Takes the state a store function returned,
  // keeps it, tells the modules to redraw, and persists.
  //
  // `silent` skips the redraw for a change the caller has already drawn itself. A sticky
  // note being typed into is the case that needs it: rebuilding the note under the cursor
  // would take the caret with it.
  function commit(next, options) {
    if (!next || next === state) return state;
    state = next;
    if (!options || !options.silent) notify();
    Persist.save(state).catch((err) => console.error("save failed:", err && err.message));
    return state;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error("listener failed:", err && err.message);
      }
    });
  }

  /* ---------- COLOURS ---------- */

  function rgbaToHex(rgba) {
    const parts = String(rgba).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!parts) return "#ffffff";
    return (
      "#" +
      parts
        .slice(1, 4)
        .map((x) => parseInt(x).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function hexToRgba(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.7)`;
  }

  function hexToRgbaAlpha(hex, alpha = 0.4) {
    if (!hex || String(hex).charAt(0) !== "#") return `rgba(255,255,255,${alpha})`;
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") return "#000000";
    if (String(rgb).startsWith("#")) return rgb;
    const match = String(rgb).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return "#000000";
    return (
      "#" +
      match
        .slice(1)
        .map((x) => parseInt(x).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  // The tile border has always been the tile background with its alpha nudged, done as a
  // string replacement. It only bites on the default colour, which is the one written with
  // an alpha of 0.4; a colour the user picked carries 0.7 and comes back unchanged.
  function borderColorFor(tileColor) {
    return String(tileColor).replace("0.4)", "0.5)");
  }

  function mainTileHex() {
    const color = state.settings.tileColor;
    if (!color) return "#ffffff";
    if (String(color).startsWith("#")) return color;
    return rgbaToHex(color);
  }

  /* ---------- APPEARANCE ---------- */

  // Settings to CSS variables. Called at boot with the stored settings and again on every
  // preview keystroke in the settings modal, which is why it takes what to apply.
  function applyAppearance(settings) {
    const css = document.documentElement.style;
    css.setProperty("--tile-label-color", settings.textColor);
    css.setProperty("--tile-label-font-family", settings.fontFamily);
    css.setProperty("--tile-bg-color", settings.tileColor);
    css.setProperty("--tile-border-color", borderColorFor(settings.tileColor));
    css.setProperty("--tile-border-width", settings.tileBorderWidth + "px");
    // A folder's preview icons lose their border along with the tiles, but never take the
    // tile's width; they were always either off or 2px.
    css.setProperty(
      "--folder-icon-border-width",
      settings.tileBorderWidth === 0 ? "0px" : "2px"
    );
    applyTilePlacement(settings.tilePlacement);
  }

  function applyTilePlacement(placement) {
    const body = document.body;
    if (placement === "middle") {
      body.style.alignItems = "center";
      body.style.paddingTop = "0px";
    } else {
      body.style.alignItems = "flex-start";
      body.style.paddingTop = "10px";
    }
  }

  /* ---------- SOUND ---------- */

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtor();
  let currentVolume = 0;

  // A slider value at or below -1 means muted. Anything else is the gain.
  function applyVolume(value) {
    currentVolume = value <= -1 ? 0 : value;
    if (currentVolume === 0 && audioCtx.state === "running") {
      audioCtx.suspend().catch((e) => console.error("suspend failed:", e));
    } else if (currentVolume > 0 && audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.error("resume failed:", e));
    }
  }

  function playTone(freq, dur) {
    if (currentVolume <= 0) return;
    const start = () => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      // Squared, so the slider feels closer to how loudness is heard.
      gain.gain.value = currentVolume * currentVolume;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.stop(audioCtx.currentTime + dur);
    };
    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(start).catch((e) => console.error("resume failed:", e));
    } else {
      start();
    }
  }

  const hoverSound = () => playTone(500, 0.06);
  const clickSound = () => playTone(180, 0.08);

  /* ---------- ALERT AND CONFIRM ---------- */

  let dialog = null;
  let dialogParts = null;

  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement("div");
    dialog.className = "modal";
    dialog.innerHTML = `
<div class="modal-content">
  <h2 id="genericModalTitle"></h2>
  <p id="genericModalMessage"></p>
  <div class="button-group" style="display:flex; justify-content:flex-end; gap:10px;"> <button id="genericModalConfirmBtn" class="primary-button" style="display:none;">OK</button> <button id="genericModalCancelBtn" class="secondary-button" style="display:none;">Cancel</button> <button id="genericModalCloseBtn" class="secondary-button">Close</button> </div>
</div>`;
    document.body.appendChild(dialog);
    dialogParts = {
      title: dialog.querySelector("#genericModalTitle"),
      message: dialog.querySelector("#genericModalMessage"),
      confirm: dialog.querySelector("#genericModalConfirmBtn"),
      cancel: dialog.querySelector("#genericModalCancelBtn"),
      close: dialog.querySelector("#genericModalCloseBtn"),
    };
  }

  function hideDialog() {
    dialog.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  function showCustomConfirm(message, onConfirm) {
    buildDialog();
    dialogParts.title.textContent = "Confirm Action";
    dialogParts.message.textContent = message;
    dialogParts.confirm.style.display = "inline-block";
    dialogParts.cancel.style.display = "inline-block";
    dialogParts.close.style.display = "none";
    dialog.style.display = "flex";
    document.body.classList.add("modal-open");
    dialogParts.confirm.onclick = () => {
      hideDialog();
      onConfirm();
    };
    dialogParts.cancel.onclick = hideDialog;
  }

  function showCustomAlert(message) {
    buildDialog();
    dialogParts.title.textContent = "Alert";
    dialogParts.message.textContent = message;
    dialogParts.confirm.style.display = "none";
    dialogParts.cancel.style.display = "none";
    dialogParts.close.style.display = "inline-block";
    dialog.style.display = "flex";
    document.body.classList.add("modal-open");
    dialogParts.close.onclick = hideDialog;
  }

  /* ---------- TEXT ---------- */

  // A tile label shows at most two lines of 18 characters. Words are kept whole where they
  // fit and chopped where they do not, and an ellipsis marks what was dropped.
  function formatVisibleName(fullName, maxChars = 18, maxLines = 2) {
    if (!fullName) return [""];
    const words = String(fullName).split(/\s+/);
    const lines = [];
    let current = "";

    const pushLine = (line) => {
      if (lines.length < maxLines) lines.push(line);
    };

    for (let w of words) {
      if (current.length === 0) {
        while (w.length > maxChars) {
          pushLine(w.slice(0, maxChars));
          w = w.slice(maxChars);
          if (lines.length >= maxLines) break;
        }
        if (lines.length >= maxLines) break;
        current = w;
      } else if (current.length + 1 + w.length <= maxChars) {
        current = current + " " + w;
      } else {
        pushLine(current);
        current = "";
        while (w.length > maxChars) {
          pushLine(w.slice(0, maxChars));
          w = w.slice(maxChars);
          if (lines.length >= maxLines) break;
        }
        if (lines.length >= maxLines) break;
        current = w;
      }
    }
    if (lines.length < maxLines && current !== "") pushLine(current);

    const visible = lines.join("\n").replace(/\n/g, " ");
    const original = String(fullName).replace(/\s+/g, " ").trim();
    if (original.length > visible.length) {
      const lastIdx = Math.min(lines.length - 1, maxLines - 1);
      let last = lines[lastIdx] || "";
      if (last.length >= maxChars) last = last.slice(0, maxChars - 1);
      lines[lastIdx] = last + "…";
    }

    return lines.map((l) => l.slice(0, maxChars));
  }

  // Writes a name into an element as text nodes and <br>, never as innerHTML.
  function writeLabel(el, name) {
    el.textContent = "";
    const lines = formatVisibleName(name || "");
    lines.forEach((line, i) => {
      el.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) el.appendChild(document.createElement("br"));
    });
  }

  root.HomeBaseApp = {
    getState,
    getSettings,
    adopt,
    commit,
    onChange,
    rgbaToHex,
    hexToRgba,
    hexToRgbaAlpha,
    rgbToHex,
    borderColorFor,
    mainTileHex,
    applyAppearance,
    applyTilePlacement,
    applyVolume,
    playTone,
    hoverSound,
    clickSound,
    showCustomAlert,
    showCustomConfirm,
    formatVisibleName,
    writeLabel,
  };
})(window);
