/* ---------- TILE GRID, FOLDERS, DRAG AND DROP ---------- */

(function (root) {
  const App = root.HomeBaseApp;
  const Store = root.HomeBaseStore;
  const State = root.HomeBaseState;
  const Menu = root.HomeBaseMenu;

  const TILE_BG_ALPHA = 0.7;
  const TILE_BORDER_ALPHA = 0.6;

  // How much of a tile counts as its centre, where a drop makes or joins a folder rather
  // than reordering. A folder is an easier target because dropping into one is the point.
  const EDGE_TILE = 0.25;
  const EDGE_FOLDER = 0.1;

  // How long a dragged tile has to hover before the grid reorders under it, so a fast pass
  // across the row does not shuffle everything.
  const DWELL_TILE = 200;
  const DWELL_FOLDER = 300;

  let container = null;
  let folderBubble = null;
  let folderOverlay = null;

  // The folder currently open, by index into state.tiles. Held as an index rather than a
  // reference so an insertion elsewhere cannot leave it pointing at a stale object.
  let openFolderIndex = null;

  // Drag cursor. `source` is the path the drag started from, `current` follows the tile as
  // the grid reorders under it.
  const drag = {
    source: null,
    current: null,
    active: false,
    dwellStart: null,
    reordered: false,
    folderMoved: false,
  };

  function state() {
    return App.getState();
  }

  function tiles() {
    return state().tiles;
  }

  const favicon = (url) => {
    try {
      return `https://www.google.com/s2/favicons?sz=64&domain_url=${new URL(url).hostname}`;
    } catch (err) {
      return "";
    }
  };

  function fromFolder() {
    return !!drag.source && drag.source.length === 2;
  }

  /* ---------- SHARED PIECES ---------- */

  function buildLabel(name) {
    const label = document.createElement("span");
    label.className = "tile-label";
    label.dataset.fullname = name || "";
    label.title = name || "";
    label.style.whiteSpace = "pre-line";
    App.writeLabel(label, name);
    label.style.width = "100%";
    label.style.textAlign = "center";
    label.style.marginTop = "8px";
    label.style.userSelect = "none";
    label.style.color = "var(--tile-label-color, white)";
    label.style.fontFamily = 'var(--tile-label-font-family, "Inter", sans-serif)';
    return label;
  }

  function buildWrapper() {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "180px";
    return wrapper;
  }

  // A folder with a colour paints its tile, its four preview boxes and its open bubble
  // with that colour. Without one it inherits the CSS variables, so the inline styles are
  // cleared rather than set.
  function paint(el, colorHex, bgAlpha, borderAlpha) {
    if (colorHex) {
      el.style.background = App.hexToRgbaAlpha(colorHex, bgAlpha);
      el.style.borderColor = App.hexToRgbaAlpha(colorHex, borderAlpha);
      el.style.backdropFilter = "none";
    } else {
      el.style.background = "";
      el.style.borderColor = "";
      el.style.backdropFilter = "";
    }
  }

  // Where in a tile the pointer is, as a fraction, and whether that counts as the centre.
  function isCentre(el, event, edge) {
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return (
      x > rect.width * edge &&
      x < rect.width * (1 - edge) &&
      y > rect.height * edge &&
      y < rect.height * (1 - edge)
    );
  }

  function clearDragClasses() {
    document.querySelectorAll(".tile").forEach((t) => {
      t.classList.remove("dragging", "moving", "placeholder", "folder-hover");
    });
  }

  function resetDrag() {
    drag.source = null;
    drag.current = null;
    drag.active = false;
    drag.dwellStart = null;
  }

  /* ---------- A REGULAR TILE ---------- */

  function buildTile(tile, path) {
    const wrapper = buildWrapper();
    const el = document.createElement("div");
    el.className = "tile";
    el.draggable = true;
    el.dataset.index = path[path.length - 1];

    const img = document.createElement("img");
    img.src = tile.icon || favicon(tile.url);
    img.alt = "";
    img.style.width = "48px";
    img.style.height = "48px";
    img.style.userSelect = "none";

    const anchor = document.createElement("a");
    anchor.href = tile.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "flex";
    anchor.style.flexDirection = "column";
    anchor.style.alignItems = "center";
    anchor.appendChild(img);
    el.appendChild(anchor);

    el.addEventListener("mouseenter", App.hoverSound, { passive: true });

    el.addEventListener("click", (e) => {
      if (e.target.closest(".tile-buttons")) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = tile.url;
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showTileMenu(e, path);
    });

    attachTileDrag(el, path);

    wrapper.appendChild(el);
    wrapper.appendChild(buildLabel(tile.name));
    return wrapper;
  }

  function attachTileDrag(el, path) {
    const inFolder = path.length === 2;

    el.addEventListener("dragstart", function () {
      drag.source = path.slice();
      drag.current = path.slice();
      drag.active = true;
      drag.dwellStart = null;
      drag.reordered = false;
      this.classList.add("dragging");
      setTimeout(() => this.classList.add("placeholder"), 0);
    });

    el.addEventListener("dragend", function () {
      this.classList.remove("dragging", "placeholder");
      clearDragClasses();
      resetDrag();
      drag.reordered = false;
    });

    if (inFolder) {
      // Inside the bubble a drag reorders on contact rather than on a dwell, because the
      // bubble is small and the tiles are close together.
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!drag.active || !fromFolder()) return;
        const target = path;
        if (drag.current[0] !== target[0] || drag.current[1] === target[1]) return;
        App.commit(Store.moveTile(state(), drag.current, target));
        drag.current = target.slice();
        openFolder(target[0]);
      });

      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const folderIndex = path[0];
        resetDrag();
        openFolder(folderIndex);
      });
      return;
    }

    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (!drag.active) return;
      if (!fromFolder() && drag.current && drag.current[0] === path[0]) return;

      const list = tiles();
      const targetIsFolder = State.isFolder(list[path[0]]);
      const draggedIsFolder =
        !fromFolder() && drag.source && State.isFolder(list[drag.source[0]]);
      const edge = targetIsFolder ? EDGE_FOLDER : EDGE_TILE;

      // A tile dropped into the middle of another makes a folder. A folder cannot be
      // dropped into anything, and neither can a tile already coming out of a folder.
      if (isCentre(this, e, edge) && !draggedIsFolder && !fromFolder()) {
        this.classList.add("folder-hover");
        drag.dwellStart = null;
        return;
      }
      this.classList.remove("folder-hover");

      // Dragging a tile at the edge of a folder must not push the folder aside, or the
      // folder would run away from the drop.
      if (targetIsFolder && !draggedIsFolder) return;

      if (!drag.dwellStart) drag.dwellStart = Date.now();
      if (Date.now() - drag.dwellStart <= DWELL_TILE) return;

      App.commit(Store.moveTile(state(), drag.current, [path[0]]));
      drag.current = [path[0]];
      drag.reordered = true;
    });

    el.addEventListener("dragleave", function () {
      this.classList.remove("folder-hover");
      drag.dwellStart = null;
    });

    el.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove("folder-hover");

      const list = tiles();
      const draggedIsFolder =
        !fromFolder() && drag.source && State.isFolder(list[drag.source[0]]);

      if (!fromFolder() && drag.source && drag.current && !draggedIsFolder) {
        const targetIsFolder = State.isFolder(list[path[0]]);
        const edge = targetIsFolder ? EDGE_FOLDER : EDGE_TILE;
        if (drag.current[0] !== path[0] && isCentre(this, e, edge)) {
          const next = targetIsFolder
            ? Store.moveIntoFolder(state(), drag.current, path[0])
            : Store.createFolder(state(), drag.current[0], path[0]);
          App.commit(next);
          resetDrag();
          clearDragClasses();
          return;
        }
      }
      resetDrag();
    });
  }

  /* ---------- A FOLDER TILE ---------- */

  function buildFolderTile(folder, index) {
    const wrapper = buildWrapper();
    const el = document.createElement("div");
    el.className = "tile folder-tile";
    el.draggable = true;
    el.dataset.index = index;
    el.dataset.type = "folder";
    paint(el, folder.colorHex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);

    const grid = document.createElement("div");
    grid.className = "folder-icon-grid";
    folder.links.slice(0, 4).forEach((link) => {
      const cell = document.createElement("div");
      cell.className = "folder-icon";
      cell.style.pointerEvents = "none";
      cell.style.cursor = "default";
      paint(cell, folder.colorHex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
      cell.style.backdropFilter = "none";

      const img = document.createElement("img");
      img.src = link.icon || favicon(link.url);
      img.alt = "";
      img.style.width = "24px";
      img.style.height = "24px";
      img.draggable = false;
      img.style.pointerEvents = "none";
      cell.appendChild(img);
      grid.appendChild(cell);
    });

    // The grid is always four cells. The empty ones sit at a lower alpha so the folder
    // reads as partly filled.
    while (grid.children.length < 4) {
      const cell = document.createElement("div");
      cell.className = "folder-icon";
      cell.style.pointerEvents = "none";
      cell.style.cursor = "default";
      cell.style.backdropFilter = "none";
      if (folder.colorHex) {
        cell.style.background = App.hexToRgbaAlpha(folder.colorHex, 0.14);
        cell.style.borderColor = App.hexToRgbaAlpha(folder.colorHex, 0.22);
      } else {
        cell.style.background = "var(--tile-bg-color)";
        cell.style.borderColor = "var(--tile-border-color)";
      }
      grid.appendChild(cell);
    }
    el.appendChild(grid);

    el.addEventListener("mouseenter", App.hoverSound, { passive: true });
    el.addEventListener("mousedown", App.clickSound, { passive: true });

    el.addEventListener("click", (e) => {
      if (e.target.closest(".tile-buttons")) return;
      openFolder(index);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showFolderMenu(e, index);
    });

    el.addEventListener("dragstart", function () {
      drag.source = [index];
      drag.current = [index];
      drag.active = true;
      drag.dwellStart = null;
      drag.reordered = false;
      drag.folderMoved = false;
      this.classList.add("dragging");
      setTimeout(() => this.classList.add("placeholder"), 0);
    });

    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (!drag.active || !drag.current) return;
      if (!fromFolder() && drag.current[0] === index) return;

      const list = tiles();
      const draggingFile =
        !fromFolder() && drag.source && !State.isFolder(list[drag.source[0]]);

      if (isCentre(this, e, EDGE_FOLDER) && draggingFile) {
        this.classList.add("folder-hover");
        drag.dwellStart = null;
        return;
      }
      this.classList.remove("folder-hover");

      // A folder cannot go inside a folder, so dragging one over another can only ever
      // mean reorder, and it happens without waiting.
      if (!draggingFile) {
        if (fromFolder()) return;
        App.commit(Store.moveTile(state(), drag.current, [index]));
        drag.current = [index];
        drag.folderMoved = true;
        drag.reordered = true;
        return;
      }

      if (!drag.dwellStart) drag.dwellStart = Date.now();
      if (Date.now() - drag.dwellStart <= DWELL_FOLDER) return;
      App.commit(Store.moveTile(state(), drag.current, [index]));
      drag.current = [index];
      drag.folderMoved = true;
      drag.reordered = true;
    });

    el.addEventListener("dragleave", function () {
      this.classList.remove("folder-hover");
      drag.dwellStart = null;
    });

    el.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove("folder-hover");

      const list = tiles();
      const draggingFile =
        !fromFolder() && drag.source && !State.isFolder(list[drag.source[0]]);

      if (
        draggingFile &&
        drag.current &&
        drag.current[0] !== index &&
        !drag.reordered &&
        isCentre(this, e, EDGE_FOLDER)
      ) {
        App.commit(Store.moveIntoFolder(state(), drag.current, index));
        clearDragClasses();
      }
      resetDrag();
    });

    el.addEventListener("dragend", function () {
      const moved = drag.folderMoved;
      clearDragClasses();
      resetDrag();
      // A folder that was picked up and put back down without moving is a click, and a
      // click on a folder opens it.
      if (!moved) openFolder(index);
      drag.reordered = false;
      drag.folderMoved = false;
    });

    wrapper.appendChild(el);
    wrapper.appendChild(buildLabel(folder.name));
    return wrapper;
  }

  /* ---------- THE GRID ---------- */

  function buildAddButton() {
    const btn = document.createElement("div");
    btn.className = "tile add-tile";
    btn.textContent = "+";
    btn.addEventListener("click", () => openTileModal({ mode: "add" }));
    btn.addEventListener("mouseenter", App.hoverSound, { passive: true });
    btn.addEventListener("mousedown", App.clickSound, { passive: true });
    return btn;
  }

  function render() {
    if (!container) container = document.getElementById("tilesContainer");
    if (!container) return;

    container.textContent = "";
    tiles().forEach((tile, i) => {
      container.appendChild(
        State.isFolder(tile) ? buildFolderTile(tile, i) : buildTile(tile, [i])
      );
    });
    container.appendChild(buildAddButton());

    if (openFolderIndex !== null) {
      const folder = tiles()[openFolderIndex];
      if (State.isFolder(folder)) renderFolderBubble(openFolderIndex);
      else closeFolder();
    }
  }

  /* ---------- THE OPEN FOLDER ---------- */

  function ensureBubble() {
    if (folderBubble) return;
    folderBubble = document.createElement("div");
    folderBubble.className = "folder-bubble";
    folderOverlay = document.createElement("div");
    folderOverlay.className = "folder-overlay";
    document.body.appendChild(folderBubble);
    document.body.appendChild(folderOverlay);
    folderOverlay.addEventListener("click", closeFolder);
  }

  function openFolder(index) {
    if (!State.isFolder(tiles()[index])) return;
    openFolderIndex = index;
    renderFolderBubble(index);
  }

  function renderFolderBubble(index) {
    ensureBubble();
    const folder = tiles()[index];
    folderBubble.textContent = "";
    folderBubble.style.fontFamily = "var(--tile-label-font-family)";

    const header = document.createElement("div");
    header.className = "folder-header-outside";
    header.style.position = "absolute";
    header.style.top = "-60px";
    header.style.left = "0";
    header.style.width = "100%";
    header.style.textAlign = "center";

    const title = document.createElement("h2");
    title.textContent = folder.name || "Folder";
    title.style.margin = "0";
    title.style.fontSize = "2rem";
    title.style.fontWeight = "600";
    title.style.color = "white";
    title.style.textShadow = "0 2px 10px rgba(0,0,0,0.5)";
    title.style.cursor = "pointer";
    title.style.display = "inline-block";
    title.title = "Click to edit folder settings";
    title.addEventListener("click", (e) => {
      e.stopPropagation();
      openFolderModal(index);
    });
    header.appendChild(title);
    folderBubble.appendChild(header);

    const inner = document.createElement("div");
    inner.className = "folder-bubble-inner";
    paint(inner, folder.colorHex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);

    const list = document.createElement("div");
    list.className = "folder-tiles-container";

    folder.links.forEach((link, i) => {
      const wrapper = buildTile(link, [index, i]);
      wrapper.style.margin = "0";
      const tileEl = wrapper.querySelector(".tile");
      if (tileEl) {
        tileEl.style.backdropFilter = "none";
        paint(tileEl, folder.colorHex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
      }
      list.appendChild(wrapper);
    });

    inner.appendChild(list);
    inner.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".tile")) return;
      e.preventDefault();
      showFolderMenu(e, index);
    });
    folderBubble.appendChild(inner);

    // The dimmed ring around the bubble grows with the number of tiles so a full folder
    // does not sit in a spotlight sized for an empty one.
    const size = Math.min(10 + folder.links.length * 3.5, 50);
    folderOverlay.style.background = `radial-gradient(ellipse at center, rgba(30, 30, 35, 0.8) ${size}%, rgba(10, 10, 12, 0.1) 100%)`;
    folderOverlay.style.display = "block";
    folderBubble.style.display = "block";
  }

  function closeFolder() {
    openFolderIndex = null;
    if (!folderBubble) return;
    folderOverlay.style.display = "none";
    folderBubble.style.display = "none";
  }

  // Dropping a tile from an open folder onto the page takes it back out. An emptied folder
  // goes with it.
  function initPageDrop() {
    document.addEventListener("dragover", (e) => {
      if (openFolderIndex !== null && !e.target.closest(".folder-bubble")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    });

    document.addEventListener("drop", (e) => {
      if (openFolderIndex === null || e.target.closest(".folder-bubble")) return;
      e.preventDefault();
      if (!fromFolder() || !drag.current) return;

      const folderIndex = drag.current[0];
      const moved = Store.getTile(state(), drag.current);
      if (!moved) return;
      if (State.isFolder(moved)) {
        App.showCustomAlert("You can't move folders between folders.");
        return;
      }

      let next = Store.moveTile(state(), drag.current, [tiles().length]);
      const folder = next.tiles[folderIndex];
      const emptied = State.isFolder(folder) && folder.links.length === 0;
      if (emptied) next = Store.removeTile(next, [folderIndex]);
      App.commit(next);

      resetDrag();
      if (emptied) closeFolder();
      else openFolder(folderIndex);
    });
  }

  /* ---------- MENUS ---------- */

  function showTileMenu(event, path) {
    const tile = Store.getTile(state(), path);
    if (!tile) return;
    Menu.show(
      [
        {
          id: "ctxOpen",
          icon: "open",
          label: "Open Link in New Tab",
          onClick: () => window.open(tile.url, "_blank"),
        },
        {
          id: "ctxEdit",
          icon: "edit",
          label: "Edit",
          onClick: () => openTileModal({ mode: "edit", path }),
        },
        {
          id: "ctxDelete",
          icon: "delete",
          label: "Delete",
          onClick: () =>
            App.showCustomConfirm("Delete this tile?", () => {
              App.commit(Store.removeTile(state(), path));
              if (path.length === 2) openFolder(path[0]);
            }),
        },
      ],
      event.clientX,
      event.clientY
    );
  }

  function showFolderMenu(event, index) {
    Menu.show(
      [
        {
          id: "ctxEdit",
          icon: "edit",
          label: "Edit",
          onClick: () => openFolderModal(index),
        },
        {
          id: "ctxDelete",
          icon: "delete",
          label: "Delete",
          onClick: () =>
            App.showCustomConfirm("Delete this folder and all its contents?", () => {
              if (openFolderIndex === index) closeFolder();
              App.commit(Store.removeTile(state(), [index]));
            }),
        },
      ],
      event.clientX,
      event.clientY
    );
  }

  /* ---------- THE TILE MODAL ---------- */

  let modal = null;
  let modalTitle = null;
  let nameInput = null;
  let urlInput = null;
  let iconInput = null;
  let editing = null;

  function openTileModal(options) {
    editing = options;
    modal.style.display = "flex";
    document.body.classList.add("modal-open");

    if (options.mode === "edit") {
      const tile = Store.getTile(state(), options.path);
      if (!tile) return closeTileModal();
      modalTitle.textContent = "Edit Site";
      nameInput.value = tile.name || "";
      urlInput.value = tile.url || "";
      iconInput.value = tile.icon || "";
    } else {
      modalTitle.textContent = "Add a Site";
      nameInput.value = "";
      urlInput.value = "";
      iconInput.value = "";
    }
    nameInput.focus();
  }

  function closeTileModal() {
    editing = null;
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  function saveTileModal() {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon = iconInput.value.trim();
    if (!name || !editing) return;

    if (editing.mode === "edit") {
      const existing = Store.getTile(state(), editing.path);
      const next = State.isFolder(existing)
        ? Store.renameFolder(state(), editing.path[0], name)
        : Store.replaceTile(state(), editing.path, { name, url, icon });
      App.commit(next);
      if (editing.path.length === 2) openFolder(editing.path[0]);
    } else if (url) {
      App.commit(Store.addTile(state(), { name, url, icon }));
    } else {
      // A name with no URL has always meant "make me an empty folder".
      App.commit(Store.addTile(state(), { type: "folder", name, links: [] }));
    }
    closeTileModal();
  }

  /* ---------- THE FOLDER MODAL ---------- */

  let folderModal = null;
  let folderNameInput = null;
  let folderColorInput = null;
  let resetFolderColorBtn = null;
  let folderEditIndex = null;

  function openFolderModal(index) {
    const folder = tiles()[index];
    if (!State.isFolder(folder)) return;
    folderEditIndex = index;
    folderModal.style.display = "flex";
    document.body.classList.add("modal-open");
    folderNameInput.value = folder.name || "";

    if (folder.colorHex) {
      folderColorInput.value = folder.colorHex;
      delete folderColorInput.dataset.useDefault;
      if (resetFolderColorBtn) resetFolderColorBtn.classList.remove("active-reset");
    } else {
      // Showing the global tile colour makes it obvious what resetting will look like.
      const hex = App.mainTileHex();
      folderColorInput.value = hex && hex.length === 7 ? hex : "#ffffff";
      folderColorInput.dataset.useDefault = "1";
      if (resetFolderColorBtn) resetFolderColorBtn.classList.add("active-reset");
    }
    folderNameInput.focus();
  }

  function closeFolderModal() {
    folderEditIndex = null;
    folderModal.style.display = "none";
    document.body.classList.remove("modal-open");
    if (folderColorInput) delete folderColorInput.dataset.useDefault;
    if (resetFolderColorBtn) resetFolderColorBtn.classList.remove("active-reset");
  }

  function saveFolderModal() {
    if (folderEditIndex === null) return;
    const index = folderEditIndex;
    const name = folderNameInput.value.trim();

    let next = state();
    if (name) next = Store.renameFolder(next, index, name);
    next = Store.setFolderColor(
      next,
      index,
      folderColorInput && folderColorInput.dataset.useDefault === "1"
        ? null
        : folderColorInput.value
    );
    App.commit(next);
    if (openFolderIndex === index) openFolder(index);
    closeFolderModal();
  }

  /* ---------- WIRING ---------- */

  function init() {
    container = document.getElementById("tilesContainer");
    modal = document.getElementById("siteModal");
    modalTitle = document.getElementById("modalTitle");
    nameInput = document.getElementById("siteName");
    urlInput = document.getElementById("siteURL");
    iconInput = document.getElementById("siteIcon");
    folderModal = document.getElementById("folderModal");
    folderNameInput = document.getElementById("folderNameInput");
    folderColorInput = document.getElementById("folderColorInput");
    resetFolderColorBtn = document.getElementById("resetFolderColorBtn");

    const saveBtn = document.getElementById("saveSite");
    const cancelBtn = document.getElementById("cancelSite");
    if (saveBtn) saveBtn.addEventListener("click", saveTileModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeTileModal);

    const saveFolderBtn = document.getElementById("saveFolderBtn");
    const cancelFolderBtn = document.getElementById("cancelFolderBtn");
    if (saveFolderBtn) saveFolderBtn.addEventListener("click", saveFolderModal);
    if (cancelFolderBtn) cancelFolderBtn.addEventListener("click", closeFolderModal);

    if (resetFolderColorBtn && folderColorInput) {
      resetFolderColorBtn.addEventListener("click", (e) => {
        e.preventDefault();
        folderColorInput.value = App.mainTileHex();
        folderColorInput.dataset.useDefault = "1";
        resetFolderColorBtn.classList.add("active-reset");
        if (folderEditIndex !== null) {
          App.commit(Store.setFolderColor(state(), folderEditIndex, null));
          if (openFolderIndex === folderEditIndex) openFolder(folderEditIndex);
        }
      });
    }

    // Live preview while the picker moves. Saved only when Save is pressed.
    if (folderColorInput) {
      folderColorInput.addEventListener("input", (e) => {
        delete folderColorInput.dataset.useDefault;
        if (resetFolderColorBtn) resetFolderColorBtn.classList.remove("active-reset");
        const hex = e.target.value;
        if (!hex || folderEditIndex === null) return;

        const tileEl = document.querySelector(
          `.tile.folder-tile[data-index="${folderEditIndex}"]`
        );
        if (tileEl) {
          paint(tileEl, hex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
          tileEl.querySelectorAll(".folder-icon").forEach((cell) => {
            paint(cell, hex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
          });
        }
        if (openFolderIndex === folderEditIndex && folderBubble) {
          const inner = folderBubble.querySelector(".folder-bubble-inner");
          if (inner) paint(inner, hex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
          folderBubble.querySelectorAll(".tile, .folder-icon").forEach((cell) => {
            paint(cell, hex, TILE_BG_ALPHA, TILE_BORDER_ALPHA);
          });
        }
      });
    }

    // A right click over the grid but not over a tile falls through to the page menu.
    if (container) {
      container.addEventListener("contextmenu", (e) => {
        const tile = e.target.closest(".tile");
        if (!tile || tile.classList.contains("add-tile")) Menu.hideAll();
      });
    }

    initPageDrop();
    App.onChange(render);
  }

  root.HomeBaseTiles = {
    init,
    render,
    openFolder,
    closeFolder,
    closeTileModal,
    closeFolderModal,
    isFolderOpen: () => openFolderIndex !== null,
  };
})(window);
