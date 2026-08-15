/* ---------- STICKY NOTES ---------- */

(function (root) {
  const App = root.HomeBaseApp;
  const Store = root.HomeBaseStore;

  const MAX_NOTES = 15;
  const MIN_WIDTH = 120;
  const MIN_HEIGHT = 80;
  const MAX_SIZE = 500;
  const DEFAULT_SIZE = 220;

  // New notes walk this list rather than repeating the previous note's colour.
  const PAPER_COLORS = ["#EDE0F5", "#FFF4BD", "#D4EAC8", "#D6EAF8", "#FADBD8"];

  const el = {};
  let editingNoteId = null;
  let lastContextMenuPos = { x: 100, y: 100 };
  let activeFormattingMenu = null;

  function state() {
    return App.getState();
  }

  function notes() {
    return state().notes;
  }

  function findNote(id) {
    return notes().find((n) => n.id === id) || null;
  }

  // Geometry and text edits are already on screen by the time they are stored, so they are
  // written without a redraw. Rebuilding a note mid-keystroke would move the caret.
  function patchNote(id, patch) {
    App.commit(Store.updateNote(state(), id, patch), { silent: true });
  }

  /* ---------- RENDER ---------- */

  function render() {
    document.querySelectorAll(".sticky-note").forEach((node) => node.remove());
    notes().forEach(buildNote);
  }

  function buildNote(note) {
    const noteEl = document.createElement("div");
    noteEl.className = "sticky-note";
    noteEl.id = `note-${note.id}`;
    noteEl.style.left = note.x + "px";
    noteEl.style.top = note.y + "px";
    if (note.width) noteEl.style.width = note.width + "px";
    if (note.height) noteEl.style.height = note.height + "px";
    noteEl.style.backgroundColor = note.paperColor || "#fff740";
    noteEl.style.zIndex = note.zIndex || 1000;

    const header = document.createElement("div");
    header.className = "sticky-note-header";

    const title = document.createElement("span");
    title.className = "sticky-note-title";
    title.textContent = note.title || "Note";
    title.contentEditable = true;
    title.spellcheck = false;
    title.addEventListener("mousedown", (e) => e.stopPropagation());
    title.addEventListener("input", () => patchNote(note.id, { title: title.textContent }));
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        title.blur();
      }
    });

    const content = document.createElement("div");
    content.className = "sticky-note-content";
    content.contentEditable = true;
    content.spellcheck = false;
    content.style.color = note.textColor || "#000000";
    content.style.fontSize = (note.fontSize || 16) + "px";
    content.style.fontFamily = note.fontFamily || "'Roboto', sans-serif";

    // Stored content is HTML that execCommand produced. Parsing it and moving the nodes
    // across keeps it out of innerHTML, which the add-on validator rejects.
    if (note.content) {
      const doc = new DOMParser().parseFromString(note.content, "text/html");
      while (doc.body.firstChild) content.appendChild(doc.body.firstChild);
    }

    const controls = document.createElement("div");
    controls.className = "sticky-note-controls";

    const anchorBtn = document.createElement("button");
    anchorBtn.className = "sticky-note-btn anchor-btn";

    // An anchored note is pinned to the page: it cannot be moved, resized or typed into.
    function applyAnchor(anchored) {
      anchorBtn.textContent = anchored ? "⚓" : "🔓";
      anchorBtn.title = anchored ? "Unanchor" : "Anchor";
      anchorBtn.style.color = anchored ? "#000" : "";
      content.contentEditable = !anchored;
      title.contentEditable = !anchored;
      noteEl.classList.toggle("docked", anchored);
    }
    applyAnchor(!!note.isAnchored);

    anchorBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      const current = findNote(note.id);
      if (!current) return;
      const next = !current.isAnchored;
      applyAnchor(next);
      patchNote(note.id, { isAnchored: next });
    });

    const settingsBtn = document.createElement("button");
    settingsBtn.className = "sticky-note-btn";
    settingsBtn.textContent = "⚙️";
    settingsBtn.title = "Settings";
    settingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openNoteSettings(note.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "sticky-note-btn delete-btn";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteNote(note.id);
    });

    controls.appendChild(anchorBtn);
    controls.appendChild(settingsBtn);
    controls.appendChild(deleteBtn);
    header.appendChild(title);
    header.appendChild(controls);

    content.addEventListener("input", () => patchNote(note.id, { content: content.innerHTML }));

    content.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showFormattingMenu(e.clientX, e.clientY, content);
    });

    // A checklist item is ticked by clicking the box drawn in its first 24 pixels.
    content.addEventListener("click", (e) => {
      if (e.target.tagName !== "LI" || !e.target.closest("ul.checklist")) return;
      const rect = e.target.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.left + 24) {
        e.target.classList.toggle("checked");
        patchNote(note.id, { content: content.innerHTML });
      }
    });

    // Enter inside a checklist makes a fresh unticked row rather than cloning the one
    // above, which would inherit its checked state.
    content.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const node = selection.getRangeAt(0).startContainer;
      const li = node.nodeType === 1 ? node.closest("li") : node.parentElement.closest("li");
      if (!li || !li.closest("ul.checklist")) return;

      e.preventDefault();
      const newLi = document.createElement("li");
      // A zero-width space, so the empty row can be selected and typed into.
      newLi.appendChild(document.createTextNode("​"));
      if (li.nextSibling) li.parentNode.insertBefore(newLi, li.nextSibling);
      else li.parentNode.appendChild(newLi);

      const range = document.createRange();
      range.setStart(newLi.firstChild, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      patchNote(note.id, { content: content.innerHTML });
    });

    ["tl", "tr", "bl", "br"].forEach((corner) => {
      noteEl.appendChild(buildResizer(corner, noteEl, note.id));
    });
    noteEl.appendChild(header);
    noteEl.appendChild(content);
    document.body.appendChild(noteEl);

    attachDrag(header, noteEl, note.id);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function buildResizer(corner, noteEl, id) {
    const handle = document.createElement("div");
    handle.className = "sticky-note-resizer resizer-" + corner;
    handle.dataset.corner = corner;
    handle.title = "Resize";
    handle.style.position = "absolute";
    handle.style.width = "18px";
    handle.style.height = "18px";
    handle.style.zIndex = 2000;
    handle.style.background = "transparent";
    handle.style.cursor = corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";

    handle.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      const note = findNote(id);
      if (!note || note.isAnchored) return;

      noteEl.classList.add("resizing");
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = noteEl.offsetWidth;
      const startH = noteEl.offsetHeight;
      const startLeft = parseInt(noteEl.style.left || 0, 10);
      const startTop = parseInt(noteEl.style.top || 0, 10);
      let box = { width: startW, height: startH, x: startLeft, y: startTop };

      function onMove(move) {
        const dx = move.clientX - startX;
        const dy = move.clientY - startY;
        let width = startW;
        let height = startH;
        let left = startLeft;
        let top = startTop;

        // Dragging a left or top corner moves the note as it resizes, so the opposite
        // corner stays put.
        if (corner === "br" || corner === "tr") {
          width = clamp(startW + dx, MIN_WIDTH, Math.min(MAX_SIZE, window.innerWidth - startLeft - 8));
        } else {
          width = clamp(startW - dx, MIN_WIDTH, MAX_SIZE);
          left = clamp(startLeft + (startW - width), 8, window.innerWidth - width - 8);
        }
        if (corner === "br" || corner === "bl") {
          height = clamp(startH + dy, MIN_HEIGHT, Math.min(MAX_SIZE, window.innerHeight - startTop - 8));
        } else {
          height = clamp(startH - dy, MIN_HEIGHT, MAX_SIZE);
          top = clamp(startTop + (startH - height), 8, window.innerHeight - height - 8);
        }

        noteEl.style.width = width + "px";
        noteEl.style.height = height + "px";
        noteEl.style.left = left + "px";
        noteEl.style.top = top + "px";
        box = { width, height, x: left, y: top };
      }

      function onUp() {
        noteEl.classList.remove("resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        patchNote(id, box);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    return handle;
  }

  function attachDrag(header, noteEl, id) {
    header.addEventListener("mousedown", (event) => {
      if (event.target.closest(".sticky-note-btn")) return;
      if (event.target.closest(".sticky-note-title")) return;
      const note = findNote(id);
      if (!note || note.isAnchored) return;

      event.preventDefault();
      noteEl.classList.add("dragging");

      const top = Math.max(
        ...Array.from(document.querySelectorAll(".sticky-note")).map((n) =>
          parseInt(n.style.zIndex || 1000, 10)
        ),
        1000
      );
      noteEl.style.zIndex = top + 1;

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseInt(noteEl.style.left || 0, 10);
      const startTop = parseInt(noteEl.style.top || 0, 10);
      let position = { x: startLeft, y: startTop, zIndex: top + 1 };

      function onMove(move) {
        const left = clamp(startLeft + move.clientX - startX, 0, window.innerWidth - noteEl.offsetWidth);
        const nextTop = clamp(startTop + move.clientY - startY, 0, window.innerHeight - noteEl.offsetHeight);
        noteEl.style.left = left + "px";
        noteEl.style.top = nextTop + "px";
        position = { x: left, y: nextTop, zIndex: top + 1 };
      }

      function onUp() {
        noteEl.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        patchNote(id, position);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  /* ---------- ADD AND DELETE ---------- */

  function addNote() {
    if (notes().length >= MAX_NOTES) {
      App.showCustomAlert("You can only create up to " + MAX_NOTES + " sticky notes.");
      return;
    }

    let color = PAPER_COLORS[0];
    if (notes().length > 0) {
      const last = PAPER_COLORS.indexOf(notes()[notes().length - 1].paperColor);
      if (last !== -1) color = PAPER_COLORS[(last + 1) % PAPER_COLORS.length];
    }

    App.commit(
      Store.addNote(state(), {
        id: Date.now(),
        x: clamp(lastContextMenuPos.x + 8, 8, window.innerWidth - DEFAULT_SIZE - 8),
        y: clamp(lastContextMenuPos.y + 8, 8, window.innerHeight - DEFAULT_SIZE - 8),
        width: DEFAULT_SIZE,
        height: DEFAULT_SIZE,
        content: "",
        title: "Note",
        paperColor: color,
        textColor: "#000000",
        fontSize: 16,
        fontFamily: "'Roboto', sans-serif",
        zIndex: 1000 + notes().length,
      })
    );

    const menu = document.getElementById("editButtonContextMenu");
    if (menu) menu.style.display = "none";
  }

  function deleteNote(id) {
    App.showCustomConfirm("Are you sure you want to delete this note?", () => {
      App.commit(Store.removeNote(state(), id));
    });
  }

  /* ---------- FORMATTING MENU ---------- */

  function hideFormattingMenu() {
    if (!activeFormattingMenu) return;
    activeFormattingMenu.remove();
    activeFormattingMenu = null;
  }

  function insideChecklist() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    const node = selection.anchorNode;
    if (!node) return false;
    const from = node.nodeType === 1 ? node : node.parentElement;
    return !!(from && from.closest("ul.checklist"));
  }

  function execFormat(cmd, value, target) {
    target.focus();
    if (cmd === "checklist") {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const node = selection.anchorNode;
      const from = node.nodeType === 1 ? node : node.parentElement;
      const list = from ? from.closest("ul") : null;

      if (list && list.classList.contains("checklist")) {
        // Already a checklist: turning it off drops the list, as any list toggle does.
        document.execCommand("insertUnorderedList");
      } else if (list) {
        list.classList.add("checklist");
      } else {
        document.execCommand("insertUnorderedList");
        const after = window.getSelection();
        if (!after.rangeCount) return;
        const anchor = after.anchorNode;
        const el2 = anchor.nodeType === 1 ? anchor : anchor.parentElement;
        const made = el2 ? el2.closest("ul") : null;
        if (made) made.classList.add("checklist");
      }
      return;
    }
    if (cmd === "formatBlock") {
      const current = document.queryCommandValue("formatBlock");
      document.execCommand(
        "formatBlock",
        false,
        current.toLowerCase() === value.toLowerCase() ? "div" : value
      );
      return;
    }
    document.execCommand(cmd, false, value);
  }

  function showFormattingMenu(x, y, target) {
    hideFormattingMenu();

    const menu = document.createElement("div");
    menu.className = "formatting-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const actions = [
      { label: "Bold", icon: "B", tag: "b", cmd: "bold" },
      { label: "Italic", icon: "I", tag: "i", cmd: "italic" },
      { separator: true },
      { label: "Header", icon: "H", cmd: "formatBlock", value: "H2" },
      { label: "List", icon: "•", cmd: "insertUnorderedList" },
      { label: "Numbered List", icon: "1.", cmd: "insertOrderedList" },
      { label: "Checklist", icon: "☑", cmd: "checklist" },
    ];

    actions.forEach((action) => {
      if (action.separator) {
        const sep = document.createElement("div");
        sep.className = "formatting-menu-separator";
        menu.appendChild(sep);
        return;
      }

      const btn = document.createElement("button");
      const iconSpan = document.createElement("span");
      iconSpan.style.width = "20px";
      iconSpan.style.textAlign = "center";
      if (action.tag) {
        const styled = document.createElement(action.tag);
        styled.textContent = action.icon;
        iconSpan.appendChild(styled);
      } else {
        iconSpan.textContent = action.icon;
      }
      btn.appendChild(iconSpan);
      btn.appendChild(document.createTextNode(` ${action.label}`));

      let active = false;
      if (action.cmd === "checklist") {
        active = insideChecklist();
      } else if (action.cmd === "insertUnorderedList") {
        // A checklist is an unordered list underneath, so the plain list button must not
        // light up while the cursor is in one.
        active = document.queryCommandState("insertUnorderedList") && !insideChecklist();
      } else if (action.cmd === "formatBlock") {
        active = document.queryCommandValue("formatBlock").toLowerCase() === action.value.toLowerCase();
      } else {
        active = document.queryCommandState(action.cmd);
      }
      if (active) btn.classList.add("active");

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        execFormat(action.cmd, action.value, target);
        hideFormattingMenu();
      });
      menu.appendChild(btn);
    });

    const sep = document.createElement("div");
    sep.className = "formatting-menu-separator";
    menu.appendChild(sep);
    menu.appendChild(buildColorRow("Text", "Text Color", "foreColor", false, target));
    menu.appendChild(buildColorRow("Highlight", "Highlight Color", "hiliteColor", true, target));

    document.body.appendChild(menu);
    activeFormattingMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = window.innerWidth - rect.width - 10 + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = window.innerHeight - rect.height - 10 + "px";
    }
  }

  function buildColorRow(label, tooltip, cmd, isHighlight, target) {
    let active = false;
    let hex = "#000000";

    if (isHighlight) {
      // queryCommandValue("hiliteColor") reports the paper colour as often as the
      // highlight, so the ancestors are walked for an explicit background instead.
      hex = "transparent";
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        while (node) {
          const element = node.nodeType === 1 ? node : node.parentElement;
          if (!element || element.classList.contains("sticky-note-content")) break;
          const bg = element.style.backgroundColor;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
            hex = App.rgbToHex(bg);
            active = true;
            break;
          }
          node = element.parentElement;
        }
      }
    } else {
      hex = App.rgbToHex(document.queryCommandValue("foreColor"));
      active = hex !== "#000000";
    }

    const row = document.createElement("div");
    row.className = "formatting-menu-color-row";

    const toggle = document.createElement("button");
    toggle.className = `formatting-menu-color-toggle ${active ? "active" : ""}`;
    const text = document.createElement("span");
    text.textContent = label;
    toggle.appendChild(text);
    toggle.title = active ? `Remove ${tooltip}` : tooltip;

    const pickerBox = document.createElement("div");
    pickerBox.className = "formatting-menu-picker-container";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "formatting-menu-color-picker";
    picker.value = isHighlight && hex === "transparent" ? "#000000" : hex;
    picker.title = `Change ${tooltip}`;
    pickerBox.appendChild(picker);

    picker.addEventListener("input", (e) => {
      e.preventDefault();
      e.stopPropagation();
      execFormat(cmd, e.target.value, target);
      toggle.classList.add("active");
      toggle.title = `Remove ${tooltip}`;
    });

    // The label only does something once a colour has been applied, where it clears it.
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!toggle.classList.contains("active")) return;
      execFormat(cmd, isHighlight ? "transparent" : "#000000", target);
      toggle.classList.remove("active");
      toggle.title = tooltip;
    });

    row.appendChild(toggle);
    row.appendChild(pickerBox);
    return row;
  }

  /* ---------- NOTE SETTINGS MODAL ---------- */

  function openNoteSettings(id) {
    const note = findNote(id);
    if (!note) return;
    editingNoteId = id;

    el.paperColor.value = note.paperColor || "#fff740";
    el.textColor.value = note.textColor || "#000000";

    const size = note.fontSize || 16;
    if (el.fontSizeSelect) {
      el.fontSizeSelect.value = size;
      const label = el.fontSizeDropdown.querySelector(".current-font-label");
      if (label) label.textContent = size + "px";
    }

    const font = note.fontFamily || "'Roboto', sans-serif";
    el.fontFamilySelect.value = font;
    const fontLabel = el.fontFamilyDropdown.querySelector(".current-font-label");
    const option = el.fontFamilyDropdown.querySelector(`.dropdown-option[data-value="${font}"]`);
    if (fontLabel && option) {
      fontLabel.textContent = option.textContent;
      fontLabel.style.fontFamily = font;
    }

    el.modal.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  function closeNoteSettings() {
    el.modal.style.display = "none";
    document.body.classList.remove("modal-open");
    editingNoteId = null;
  }

  function saveNoteSettings() {
    if (editingNoteId !== null) {
      App.commit(
        Store.updateNote(state(), editingNoteId, {
          paperColor: el.paperColor.value,
          textColor: el.textColor.value,
          fontSize: parseInt(el.fontSizeSelect.value, 10),
          fontFamily: el.fontFamilySelect.value,
        })
      );
    }
    closeNoteSettings();
  }

  // The two dropdowns in this modal only set their hidden input; Save reads it.
  function setupNoteDropdown(dropdown, input, styleLabel) {
    if (!dropdown) return;
    const selected = dropdown.querySelector(".dropdown-selected");
    const label = selected.querySelector(".current-font-label");

    selected.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".custom-dropdown").forEach((d) => {
        if (d !== dropdown) d.classList.remove("open");
      });
      dropdown.classList.toggle("open");
    });

    dropdown.querySelectorAll(".dropdown-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = option.dataset.value;
        label.textContent = option.textContent;
        if (styleLabel) label.style.fontFamily = option.dataset.value;
        dropdown.classList.remove("open");
      });
    });
  }

  /* ---------- WIRING ---------- */

  function init() {
    el.modal = document.getElementById("stickyNoteSettingsModal");
    el.saveBtn = document.getElementById("saveStickyNoteSettingsBtn");
    el.cancelBtn = document.getElementById("cancelStickyNoteSettingsBtn");
    el.addBtn = document.getElementById("addStickyNoteCtxBtn");
    el.paperColor = document.getElementById("notePaperColorInput");
    el.textColor = document.getElementById("noteTextColorInput");
    el.fontSizeDropdown = document.getElementById("noteFontSizeDropdown");
    el.fontSizeSelect = document.getElementById("noteFontSizeSelect");
    el.fontFamilyDropdown = document.getElementById("noteFontFamilyDropdown");
    el.fontFamilySelect = document.getElementById("noteFontFamilySelect");

    // A new note appears where the menu that created it was opened.
    document.addEventListener(
      "contextmenu",
      (e) => {
        lastContextMenuPos = { x: e.clientX, y: e.clientY };
      },
      { passive: true }
    );

    document.addEventListener("click", (e) => {
      if (activeFormattingMenu && !activeFormattingMenu.contains(e.target)) hideFormattingMenu();
    });

    if (el.addBtn) el.addBtn.addEventListener("click", addNote);
    if (el.saveBtn) el.saveBtn.addEventListener("click", saveNoteSettings);
    if (el.cancelBtn) el.cancelBtn.addEventListener("click", closeNoteSettings);

    setupNoteDropdown(el.fontSizeDropdown, el.fontSizeSelect, false);
    setupNoteDropdown(el.fontFamilyDropdown, el.fontFamilySelect, true);

    App.onChange(render);
  }

  root.HomeBaseNotes = { init, render, closeNoteSettings };
})(window);
