/* ---------- TOOLBAR POPUP ---------- */
// Adds the current tab as a tile, at the top level or into a folder. Writes through the
// same store and the same persistence path as the new tab page, so the two cannot disagree
// about where the tiles are.

document.addEventListener("DOMContentLoaded", () => {
  const State = window.HomeBaseState;
  const Store = window.HomeBaseStore;
  const Persist = window.HomeBasePersist;

  const nameInput = document.getElementById("popupSiteName");
  const urlInput = document.getElementById("popupSiteURL");
  const iconInput = document.getElementById("popupSiteIcon");
  const folderSelect = document.getElementById("popupFolderSelect");
  const saveBtn = document.getElementById("popupSaveSite");
  const cancelBtn = document.getElementById("popupCancelSite");

  const btnShowAddFolder = document.getElementById("btnShowAddFolder");
  const newFolderGroup = document.getElementById("newFolderGroup");
  const newFolderName = document.getElementById("popupNewFolderName");
  const btnCancelAddFolder = document.getElementById("btnCancelAddFolder");

  let current = State.createState({});

  /* ---------- PREFILL FROM THE ACTIVE TAB ---------- */

  if (typeof browser !== "undefined" && browser.tabs && browser.tabs.query) {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tab = tabs && tabs[0];
        if (!tab) return;
        if (tab.title && !nameInput.value) nameInput.value = tab.title;
        if (tab.url && !urlInput.value) urlInput.value = tab.url;
        if (tab.favIconUrl && iconInput && !iconInput.value) iconInput.value = tab.favIconUrl;
      })
      .catch(() => {
        // No tab permission or no active tab; the fields stay empty.
      });
  }

  /* ---------- FOLDER LIST ---------- */

  Persist.load()
    .then(({ state }) => {
      current = state;
      if (!folderSelect) return;
      while (folderSelect.options.length > 1) folderSelect.remove(1);
      state.tiles.forEach((tile) => {
        if (!State.isFolder(tile) || !tile.name) return;
        const option = document.createElement("option");
        option.value = tile.name;
        option.textContent = tile.name;
        folderSelect.appendChild(option);
      });
    })
    .catch((err) => console.error("popup could not read state:", err && err.message));

  if (btnShowAddFolder && newFolderGroup) {
    btnShowAddFolder.addEventListener("click", () => {
      if (folderSelect) folderSelect.parentElement.style.display = "none";
      newFolderGroup.style.display = "block";
      if (newFolderName) newFolderName.focus();
    });
  }

  if (btnCancelAddFolder && newFolderGroup) {
    btnCancelAddFolder.addEventListener("click", () => {
      newFolderGroup.style.display = "none";
      if (folderSelect) folderSelect.parentElement.style.display = "flex";
      if (newFolderName) newFolderName.value = "";
    });
  }

  /* ---------- SAVE ---------- */

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon = iconInput.value.trim();

    if (!name || !url) {
      alert("Please enter both a name and URL");
      return;
    }
    try {
      new URL(url);
    } catch (err) {
      alert("Please enter a valid URL");
      return;
    }

    let folderName = folderSelect ? folderSelect.value : "none";
    let isNew = false;
    if (newFolderGroup && newFolderGroup.style.display !== "none") {
      const typed = newFolderName.value.trim();
      if (typed) {
        folderName = typed;
        isNew = true;
      } else {
        folderName = "none";
      }
    }

    const tile = { name, url };
    if (icon) tile.icon = icon;

    let next;
    if (folderName && folderName !== "none") {
      if (isNew) {
        next = Store.addTile(current, { type: "folder", name: folderName, links: [tile] });
      } else {
        const index = current.tiles.findIndex(
          (item) => State.isFolder(item) && item.name === folderName
        );
        // A folder that has gone missing between opening the popup and pressing Save
        // should not lose the tile, so it lands at the top level instead.
        next =
          index === -1
            ? Store.addTile(current, tile)
            : Store.addTile(current, tile, { folderIndex: index });
      }
    } else {
      next = Store.addTile(current, tile);
    }

    await Persist.save(next);

    if (typeof browser !== "undefined" && browser.runtime) {
      await browser.runtime.sendMessage({ action: "tileAdded" }).catch(() => {
        // Nothing listening, which just means no new tab page is open.
      });
    }
    window.close();
  });

  cancelBtn.addEventListener("click", () => window.close());
});
