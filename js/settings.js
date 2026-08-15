/* ---------- SETTINGS MODAL, EXPORT AND IMPORT ---------- */
// Edits are made against a draft copy of the settings. Every control previews live by
// applying the draft, Save commits it through the store, and Cancel throws it away and
// reapplies what is stored. Before v3 the same thing was done with three `pending`
// variables, a parallel set of `saved` variables, and a Cancel path that reread
// localStorage key by key.

(function (root) {
  const App = root.HomeBaseApp;
  const Store = root.HomeBaseStore;
  const State = root.HomeBaseState;
  const Persist = root.HomeBasePersist;
  const Clock = root.HomeBaseClock;
  const Wallpaper = root.HomeBaseWallpaper;
  const Menu = root.HomeBaseMenu;

  const el = {};
  let draft = null;

  // Blocks that fold away. Both start closed each time the modal opens.
  const COLLAPSIBLE = ["clockSettingsGroup", "syncSettingsGroup"];

  function state() {
    return App.getState();
  }

  function live() {
    return draft || state().settings;
  }

  // Pushes the current draft at everything that renders a setting.
  function applyDraft() {
    App.applyAppearance(live());
    Clock.apply(live());
    App.applyVolume(live().soundVolume);
  }

  /* ---------- CUSTOM DROPDOWNS ---------- */
  // Not <select> elements: a div menu bound to a hidden input.

  function setupDropdown(dropdownId, inputId, onChange) {
    const dropdown = document.getElementById(dropdownId);
    const input = document.getElementById(inputId);
    if (!dropdown || !input) return;

    const selected = dropdown.querySelector(".dropdown-selected");
    const options = dropdown.querySelectorAll(".dropdown-option");
    const label = dropdown.querySelector(".current-font-label");

    selected.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".custom-dropdown").forEach((d) => {
        if (d !== dropdown) d.classList.remove("open");
      });
      dropdown.classList.toggle("open");
    });

    options.forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = option.dataset.value;
        if (label) label.textContent = option.textContent;
        options.forEach((o) => o.classList.remove("selected"));
        option.classList.add("selected");
        dropdown.classList.remove("open");
        if (onChange) onChange(option.dataset.value);
      });
    });

    refreshDropdown(dropdownId, inputId);
  }

  function refreshDropdown(dropdownId, inputId) {
    const dropdown = document.getElementById(dropdownId);
    const input = document.getElementById(inputId);
    if (!dropdown || !input) return;
    const label = dropdown.querySelector(".current-font-label");
    const options = dropdown.querySelectorAll(".dropdown-option");
    const match = Array.from(options).find((o) => o.dataset.value === input.value);
    if (!match) return;
    if (label) label.textContent = match.textContent;
    options.forEach((o) => o.classList.remove("selected"));
    match.classList.add("selected");
  }

  /* ---------- THE VOLUME SLIDER ---------- */

  // Chrome has no equivalent of Firefox's ::-moz-range-progress, so the filled part of the
  // track is painted as a background gradient.
  function paintRange(input) {
    if (!input || input.type !== "range") return;
    const style = getComputedStyle(document.documentElement);
    const fill = style.getPropertyValue("--button-primary-bg") || "#6366f1";
    const track = style.getPropertyValue("--input-border-dark") || "rgba(255,255,255,0.2)";
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1;
    const value = parseFloat(input.value);
    const pct = Math.max(
      0,
      Math.min(100, (((isNaN(value) ? min : value) - min) / (max - min)) * 100)
    );
    input.style.background = `linear-gradient(90deg, ${fill} ${pct}%, ${track} ${pct}%)`;
    input.style.backgroundSize = "100% 6px";
    input.style.backgroundPosition = "0 50%";
    input.style.backgroundRepeat = "no-repeat";
  }

  /* ---------- OPEN AND CLOSE ---------- */

  function openEditModal() {
    draft = Object.assign({}, state().settings);

    el.textColorInput.value = draft.textColor;
    el.tileColorInput.value = App.rgbaToHex(draft.tileColor);
    el.fontFamilySelect.value = draft.fontFamily;
    refreshDropdown("fontFamilyDropdown", "fontFamilySelect");

    el.clockColorInput.value = draft.clockColor;
    el.clockFontFamilySelect.value = draft.clockFontFamily;
    refreshDropdown("clockFontFamilyDropdown", "clockFontFamilySelect");
    el.clockFormatSelect.value = draft.clockFormat;
    refreshDropdown("clockFormatDropdown", "clockFormatSelect");
    el.clockPositionSelect.value = draft.clockPosition;
    refreshDropdown("clockPositionDropdown", "clockPositionSelect");
    el.showClockToggle.checked = draft.showClock;
    el.showSecondsToggle.checked = draft.showSeconds;
    if (el.clockSizeInput) el.clockSizeInput.value = draft.clockSize;

    el.tilePlacementSelect.value = draft.tilePlacement;
    refreshDropdown("tilePlacementDropdown", "tilePlacementSelect");
    el.tileBorderWidthSelect.value = draft.tileBorderWidth + "px";
    refreshDropdown("tileBorderWidthDropdown", "tileBorderWidthSelect");

    if (el.soundVolumeInput) {
      el.soundVolumeInput.value = draft.soundVolume;
      paintRange(el.soundVolumeInput);
    }
    document.querySelectorAll("input[type=range]").forEach(paintRange);

    // The collapsible blocks start closed however they were left last time.
    COLLAPSIBLE.forEach((id) => {
      const group = document.getElementById(id);
      if (!group) return;
      group.classList.remove("open");
      const content = group.querySelector(".collapsible-content");
      if (!content) return;
      content.style.maxHeight = "0px";
      content.style.opacity = "0";
      content.style.paddingTop = "0px";
    });

    // Sync settings live outside the state object, so they are read straight from storage
    // rather than from the draft.
    Persist.loadSync()
      .then((sync) => {
        if (el.syncEnabledToggle) el.syncEnabledToggle.checked = sync.enabled;
        if (el.syncTokenInput) el.syncTokenInput.value = sync.token;
      })
      .catch((err) => console.error("sync settings read failed:", err && err.message));

    el.editModal.style.display = "flex";
    document.body.classList.add("modal-open");
    Menu.hideAll();
  }

  function closeEditModal() {
    draft = null;
    el.editModal.style.display = "none";
    document.body.classList.remove("modal-open");
    applyDraft();
  }

  function saveSettings() {
    if (!draft) return closeEditModal();
    const next = Store.setSettings(state(), draft);
    draft = null;
    App.commit(next);
    applyDraft();

    if (el.syncEnabledToggle) {
      const enabled = el.syncEnabledToggle.checked;
      const token = el.syncTokenInput ? el.syncTokenInput.value.trim() : "";
      Persist.saveSync({ enabled, token })
        // Restarting rather than reloading means turning sync on takes effect at once, and
        // turning it off closes the event stream at once.
        .then(() => root.HomeBaseSync && root.HomeBaseSync.restart())
        .catch((err) => console.error("sync settings write failed:", err && err.message));
    }

    el.editModal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  /* ---------- EXPORT AND IMPORT ---------- */

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportAs(type, filename, message) {
    // Reading the background here is what the full export got wrong before v3: it asked
    // chrome.storage for tiles and customBackground, then read result.stickyNotes, a key
    // it had not requested, and fell through to the localStorage copy every time.
    const background =
      type === "links" ? null : await Persist.loadBackground().catch(() => null);
    downloadJSON(Store.exportState(state(), type, { customBackground: background }), filename);
    App.showCustomAlert(message);
  }

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.target.result);
      } catch (err) {
        App.showCustomAlert("Error parsing import file: " + err.message);
        return;
      }

      const result = Store.importState(parsed, state());
      if (!result.ok) {
        App.showCustomAlert(
          result.reason === "unknown type"
            ? "Unknown import file type"
            : "Invalid import file: Missing type or version information"
        );
        return;
      }

      App.showCustomConfirm("This will overwrite your current data. Continue?", async () => {
        App.commit(result.state);
        if (result.customBackground) {
          await Wallpaper.set(result.customBackground).catch((err) =>
            console.error("background import failed:", err && err.message)
          );
        }
        App.showCustomAlert("Import successful! Page will reload...");
        try {
          el.importInput.value = "";
        } catch (err) {
          // Some browsers refuse to clear a file input; the reload settles it anyway.
        }
        setTimeout(() => location.reload(), 1500);
      });
    };
    reader.readAsText(file);
  }

  /* ---------- RESETS ---------- */

  function resetColors() {
    const next = Store.clearFolderColors(
      Store.setSettings(state(), {
        tileColor: State.DEFAULT_SETTINGS.tileColor,
        textColor: State.DEFAULT_SETTINGS.textColor,
      })
    );
    App.commit(next);
    if (draft) {
      draft.tileColor = State.DEFAULT_SETTINGS.tileColor;
      draft.textColor = State.DEFAULT_SETTINGS.textColor;
    }
    applyDraft();
    if (el.tileColorInput) el.tileColorInput.value = App.rgbaToHex(State.DEFAULT_SETTINGS.tileColor);
    if (el.textColorInput) el.textColorInput.value = State.DEFAULT_SETTINGS.textColor;
    if (el.clockColorInput) el.clockColorInput.value = State.DEFAULT_SETTINGS.clockColor;
  }

  function reloadSoon() {
    setTimeout(() => location.reload(), 1500);
  }

  function initResets() {
    el.resetAllSettingsBtn.addEventListener("click", () => {
      el.editModal.style.display = "none";
      el.resetConfirmModal.style.display = "flex";
      document.body.classList.add("modal-open");
    });

    el.cancelResetOptionsBtn.addEventListener("click", () => {
      el.resetConfirmModal.style.display = "none";
      document.body.classList.remove("modal-open");
      openEditModal();
    });

    el.resetAllLinksOnlyBtn.addEventListener("click", () => {
      App.showCustomConfirm(
        "Are you sure you want to reset ALL your saved links and sticky notes? Your custom settings (colors, fonts, background, etc.) will remain.",
        async () => {
          const next = State.createState({ settings: state().settings });
          App.commit(next);
          await Persist.save(next);
          App.showCustomAlert("All links and notes have been reset! The page will now reload.");
          reloadSoon();
        }
      );
    });

    el.resetAllSettingsOnlyBtn.addEventListener("click", () => {
      App.showCustomConfirm(
        "Are you sure you want to reset ALL settings to default? This will clear all custom colors, fonts, display options, and background, but your saved links and sticky notes will remain.",
        async () => {
          const next = Store.clearFolderColors(Store.resetSettings(state()));
          App.commit(next);
          await Persist.save(next);
          await Persist.clearBackground();
          App.showCustomAlert("All settings have been reset! The page will now reload.");
          reloadSoon();
        }
      );
    });

    el.resetAllSettingsAndLinksBtn.addEventListener("click", () => {
      App.showCustomConfirm(
        "Are you sure you want to reset ALL settings and tiles to default? This will clear all custom colors, fonts, display options, background, AND all your saved links and sticky notes.",
        async () => {
          await Persist.clearAll();
          App.showCustomAlert("All settings and tiles have been reset! The page will now reload.");
          reloadSoon();
        }
      );
    });
  }

  /* ---------- COLLAPSIBLE BLOCKS ---------- */

  function setupCollapsible(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const content = group.querySelector(".collapsible-content");
    if (!content) return;

    if (!group.classList.contains("open")) {
      content.style.maxHeight = "0px";
      content.style.opacity = "0";
      content.style.paddingTop = "0px";
    }

    function toggle(forceOpen) {
      const open = typeof forceOpen === "boolean" ? forceOpen : !group.classList.contains("open");
      if (open) {
        group.classList.add("open");
        content.style.maxHeight = content.scrollHeight + 24 + "px";
        content.style.opacity = "1";
        content.style.paddingTop = "10px";
      } else {
        group.classList.remove("open");
        content.style.maxHeight = "0px";
        content.style.opacity = "0";
        content.style.paddingTop = "0px";
      }
    }

    group.addEventListener("click", (event) => {
      // A click that lands on a control is for the control, not for the header.
      const interactive = ["INPUT", "SELECT", "TEXTAREA", "LABEL", "BUTTON"];
      let node = event.target;
      while (node && node !== group) {
        if (interactive.includes(node.tagName)) return;
        node = node.parentElement;
      }
      toggle();
    });

    const header = group.querySelector(".collapsible-header");
    if (header) {
      header.setAttribute("tabindex", "0");
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    }

    content.querySelectorAll("input,select,textarea").forEach((input) => {
      input.addEventListener("focus", () => toggle(true));
    });
  }

  /* ---------- CONTACT ---------- */

  const CONTACT_EMAIL = "cagantshomepage@gmail.com";

  function initContact() {
    const contactModal = document.getElementById("contactModal");
    const contactBtn = document.getElementById("contactBtn");
    const copyBtn = document.getElementById("copyEmailBtn");
    const closeBtn = document.getElementById("closeContactModalBtn");
    const address = document.getElementById("contactEmail");
    const mailBtn = document.getElementById("mailBtn");

    if (address) address.textContent = CONTACT_EMAIL;

    if (contactBtn && contactModal) {
      contactBtn.addEventListener("click", () => {
        closeEditModal();
        contactModal.style.display = "flex";
        document.body.classList.add("modal-open");
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(CONTACT_EMAIL)
          .then(() => {
            App.showCustomAlert("Email copied to clipboard!");
            if (contactModal) contactModal.style.display = "none";
          })
          .catch((err) => App.showCustomAlert("Failed to copy email: " + err));
      });
    }

    if (closeBtn && contactModal) {
      closeBtn.addEventListener("click", () => {
        contactModal.style.display = "none";
        document.body.classList.remove("modal-open");
      });
    }

    if (mailBtn) {
      mailBtn.addEventListener("click", () => {
        window.location.href = "mailto:" + CONTACT_EMAIL;
      });
    }
  }

  /* ---------- WIRING ---------- */

  function init() {
    [
      "editBtn",
      "editModal",
      "textColorInput",
      "tileColorInput",
      "saveSettingsBtn",
      "cancelSettingsBtn",
      "fontFamilySelect",
      "soundVolumeInput",
      "resetAllSettingsBtn",
      "tileBorderWidthSelect",
      "tilePlacementSelect",
      "showClockToggle",
      "clockColorInput",
      "clockFontFamilySelect",
      "clockFormatSelect",
      "showSecondsToggle",
      "clockSizeInput",
      "clockPositionSelect",
      "exportBtn",
      "importBtn",
      "importInput",
      "resetConfirmModal",
      "resetAllSettingsAndLinksBtn",
      "resetAllSettingsOnlyBtn",
      "resetAllLinksOnlyBtn",
      "cancelResetOptionsBtn",
      "exportConfirmModal",
      "exportAllSettingsAndLinksBtn",
      "exportAllSettingsOnlyBtn",
      "exportAllLinksOnlyBtn",
      "cancelExportOptionsBtn",
      "resetColorsBtn",
      "syncEnabledToggle",
      "syncTokenInput",
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });

    el.editBtn.addEventListener("click", openEditModal);
    el.saveSettingsBtn.addEventListener("click", saveSettings);
    el.cancelSettingsBtn.addEventListener("click", closeEditModal);

    el.textColorInput.addEventListener("input", (e) => {
      if (!draft) return;
      draft.textColor = e.target.value;
      applyDraft();
    });

    el.tileColorInput.addEventListener("input", (e) => {
      if (!draft) return;
      draft.tileColor = App.hexToRgba(e.target.value);
      applyDraft();
    });

    el.clockColorInput.addEventListener("input", (e) => {
      if (!draft) return;
      draft.clockColor = e.target.value;
      applyDraft();
    });

    el.showClockToggle.addEventListener("change", (e) => {
      if (!draft) return;
      draft.showClock = e.target.checked;
      applyDraft();
    });

    el.showSecondsToggle.addEventListener("change", (e) => {
      if (!draft) return;
      draft.showSeconds = e.target.checked;
      applyDraft();
    });

    if (el.clockSizeInput) {
      el.clockSizeInput.addEventListener("input", (e) => {
        if (!draft) return;
        draft.clockSize = parseInt(e.target.value, 10) || State.DEFAULT_SETTINGS.clockSize;
        applyDraft();
        paintRange(e.target);
      });
    }

    if (el.soundVolumeInput) {
      el.soundVolumeInput.addEventListener("input", (e) => {
        if (!draft) return;
        draft.soundVolume = parseFloat(e.target.value);
        App.applyVolume(draft.soundVolume);
        paintRange(e.target);
      });
    }

    setupDropdown("fontFamilyDropdown", "fontFamilySelect", (value) => {
      if (!draft) return;
      draft.fontFamily = value;
      applyDraft();
    });
    setupDropdown("clockFontFamilyDropdown", "clockFontFamilySelect", (value) => {
      if (!draft) return;
      draft.clockFontFamily = value;
      applyDraft();
    });
    setupDropdown("clockFormatDropdown", "clockFormatSelect", (value) => {
      if (!draft) return;
      draft.clockFormat = value;
      applyDraft();
    });
    setupDropdown("clockPositionDropdown", "clockPositionSelect", (value) => {
      if (!draft) return;
      draft.clockPosition = value;
      applyDraft();
    });
    setupDropdown("tilePlacementDropdown", "tilePlacementSelect", (value) => {
      if (!draft) return;
      draft.tilePlacement = value;
      applyDraft();
    });
    setupDropdown("tileBorderWidthDropdown", "tileBorderWidthSelect", (value) => {
      if (!draft) return;
      draft.tileBorderWidth = parseFloat(value) || 0;
      applyDraft();
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".custom-dropdown").forEach((d) => d.classList.remove("open"));
    });

    // The atmosphere strip is not part of the draft. Clicking one applies and stores it
    // straight away, which is how it behaved before v3.
    document.querySelectorAll(".atmosphere-compact-btn").forEach((btn) => {
      if (btn.dataset.effect === state().settings.atmosphereEffect) btn.classList.add("active");
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".atmosphere-compact-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (root.effectManager) root.effectManager.setEffect(btn.dataset.effect);
        if (draft) draft.atmosphereEffect = btn.dataset.effect;
        App.commit(Store.setSettings(state(), { atmosphereEffect: btn.dataset.effect }));
      });
    });

    if (el.resetColorsBtn) {
      el.resetColorsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        App.showCustomConfirm(
          "Reset all colors to defaults? This will also remove individual folder colors.",
          () => {
            resetColors();
            App.showCustomAlert("All colors reset to defaults.");
          }
        );
      });
    }

    el.exportBtn.addEventListener("click", () => {
      el.editModal.style.display = "none";
      el.exportConfirmModal.style.display = "flex";
      document.body.classList.add("modal-open");
    });
    el.cancelExportOptionsBtn.addEventListener("click", () => {
      el.exportConfirmModal.style.display = "none";
      document.body.classList.remove("modal-open");
      openEditModal();
    });
    el.exportAllSettingsAndLinksBtn.addEventListener("click", () =>
      exportAs("full", "HomeBase_FullBackup.json", "All settings and links exported successfully!")
    );
    el.exportAllSettingsOnlyBtn.addEventListener("click", () =>
      exportAs("settings", "HomeBase_Settings.json", "Settings exported successfully!")
    );
    el.exportAllLinksOnlyBtn.addEventListener("click", () =>
      exportAs("links", "HomeBase_LinksAndNotes.json", "Links and Notes exported successfully!")
    );

    el.importBtn.addEventListener("click", () => el.importInput.click());
    el.importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleImportFile(file);
    });

    initResets();
    initContact();
    COLLAPSIBLE.forEach((id) => setupCollapsible(id));

    // A click on the page, or a context menu opening, closes these two.
    Menu.onDismiss(() => {
      if (el.resetConfirmModal) el.resetConfirmModal.style.display = "none";
      const contactModal = document.getElementById("contactModal");
      if (contactModal) contactModal.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".context-menu") && !e.target.closest(".modal")) Menu.hideAll();
    });
  }

  function closeAllModals() {
    closeEditModal();
    if (el.resetConfirmModal) el.resetConfirmModal.style.display = "none";
    if (el.exportConfirmModal) el.exportConfirmModal.style.display = "none";
    const contactModal = document.getElementById("contactModal");
    if (contactModal) contactModal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  root.HomeBaseSettings = { init, openEditModal, closeEditModal, closeAllModals };
})(window);
