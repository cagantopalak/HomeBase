document.addEventListener('DOMContentLoaded', function () {
  // Polyfill `browser` API for Chrome so Firefox-style code works unchanged
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = {};
    // Helper to safely read chrome.runtime.lastError without throwing in exotic environments
    const _getChromeLastError = () => {
      try {
        return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null;
      } catch (e) {
        return null;
      }
    };

    browser.storage = {
      local: {
        get: (keys) => new Promise((resolve, reject) => {
          chrome.storage.local.get(keys, (items) => {
            const _err = _getChromeLastError();
            if (_err) return reject(new Error(_err.message || String(_err)));
            resolve(items);
          });
        }),
        set: (obj) => new Promise((resolve, reject) => {
          chrome.storage.local.set(obj, () => {
            const _err = _getChromeLastError();
            if (_err) return reject(new Error(_err.message || String(_err)));
            resolve();
          });
        }),
        remove: (key) => new Promise((resolve, reject) => {
          chrome.storage.local.remove(key, () => {
            const _err = _getChromeLastError();
            if (_err) return reject(new Error(_err.message || String(_err)));
            resolve();
          });
        }),
        clear: () => new Promise((resolve, reject) => {
          chrome.storage.local.clear(() => {
            const _err = _getChromeLastError();
            if (_err) return reject(new Error(_err.message || String(_err)));
            resolve();
          })
        })
      }
    };
    browser.tabs = {
      query: (queryInfo) => new Promise((resolve) => chrome.tabs.query(queryInfo, (tabs) => resolve(tabs)))
    };
    browser.runtime = {
      sendMessage: (msg) => new Promise((resolve, reject) => chrome.runtime.sendMessage(msg, (res) => {
        const _err = _getChromeLastError();
        if (_err) return reject(new Error(_err.message || String(_err)));
        resolve(res);
      })),
      onMessage: chrome.runtime.onMessage
    };
    browser.runtime.getURL = chrome.runtime.getURL.bind(chrome.runtime);
  }

  const nameInput = document.getElementById('popupSiteName');
  const urlInput = document.getElementById('popupSiteURL');
  const iconInput = document.getElementById('popupSiteIcon');
  const folderSelect = document.getElementById('popupFolderSelect');
  const saveBtn = document.getElementById('popupSaveSite');
  const cancelBtn = document.getElementById('popupCancelSite');

  // New UI elements for folder creation
  const btnShowAddFolder = document.getElementById('btnShowAddFolder');
  const newFolderGroup = document.getElementById('newFolderGroup');
  const popupNewFolderName = document.getElementById('popupNewFolderName');
  const btnCancelAddFolder = document.getElementById('btnCancelAddFolder');

  // Prefill from the active tab
  try {
    if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.query === 'function') {
      if (nameInput && urlInput && !nameInput.value && !urlInput.value) {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
          if (!tabs || tabs.length === 0) return;
          const tab = tabs[0];
          try {
            if (tab.title && !nameInput.value) nameInput.value = tab.title;
          } catch (e) { }
          try {
            if (tab.url && !urlInput.value) urlInput.value = tab.url;
          } catch (e) { }
          try {
            if (tab.favIconUrl && iconInput && !iconInput.value) iconInput.value = tab.favIconUrl;
          } catch (e) { }
        }).catch(() => {
          // Ignore errors
        });
      }
    }
  } catch (err) {
    // defensive
  }

  // Populate folder dropdown
  const populateFolderOptions = () => {
    if (!folderSelect) return;
    browser.storage.local.get('tiles').then(result => {
      const tiles = result.tiles || [];
      const names = new Set();

      tiles.forEach(t => {
        if (t && t.type === 'folder' && t.name) names.add(t.name);
      });

      // remove any existing options except the first 'none'
      while (folderSelect.options.length > 1) folderSelect.remove(1);

      names.forEach(n => {
        if (!n) return;
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        folderSelect.appendChild(opt);
      });
    }).catch(() => {
      // ignore storage read errors silently
    });
  };

  populateFolderOptions();

  // Event Listeners for New Folder UI
  if (btnShowAddFolder && newFolderGroup) {
    btnShowAddFolder.addEventListener('click', () => {
      if (folderSelect) folderSelect.parentElement.style.display = 'none';
      newFolderGroup.style.display = 'block';
      if (popupNewFolderName) popupNewFolderName.focus();
    });
  }

  if (btnCancelAddFolder && newFolderGroup) {
    btnCancelAddFolder.addEventListener('click', () => {
      newFolderGroup.style.display = 'none';
      if (folderSelect) folderSelect.parentElement.style.display = 'flex';
      if (popupNewFolderName) popupNewFolderName.value = '';
    });
  }

  // Save Button Logic
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon = iconInput.value.trim();
    let selectedFolder = folderSelect ? folderSelect.value : 'none';
    let isNewFolder = false;

    // Check if we are in "New Folder" mode
    if (newFolderGroup && newFolderGroup.style.display !== 'none') {
      const newName = popupNewFolderName.value.trim();
      if (newName) {
        selectedFolder = newName;
        isNewFolder = true;
      } else {
        // If user cleared the input, treat as no folder
        selectedFolder = 'none';
      }
    }

    if (!name || !url) {
      alert('Please enter both a name and URL');
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      alert('Please enter a valid URL');
      return;
    }

    // Get existing tiles from storage
    browser.storage.local.get('tiles').then(result => {
      const links = result.tiles || [];

      // Build tile object
      const tile = { name, url };
      if (icon) tile.icon = icon;

      // If a folder is selected (or created)
      if (selectedFolder && selectedFolder !== 'none') {
        if (isNewFolder) {
          // Create new folder with this tile
          const newFolder = {
            type: 'folder',
            name: selectedFolder,
            links: [tile]
          };
          links.push(newFolder);
        } else {
          // Add to existing folder
          const folderIndex = links.findIndex(l => l && l.type === 'folder' && l.name === selectedFolder);
          if (folderIndex !== -1) {
            links[folderIndex].links = links[folderIndex].links || [];
            links[folderIndex].links.push(tile);
          } else {
            // If folder not found for some reason, fallback to adding top-level
            links.push(tile);
          }
        }
      } else {
        // add as top-level tile
        links.push(tile);
      }

      // Save back to storage
      browser.storage.local.set({ tiles: links }).then(() => {
        // Notify the new tab page if it's open
        browser.runtime.sendMessage({ action: 'tileAdded' });
        window.close();
      });
    });
  });

  cancelBtn.addEventListener('click', () => {
    window.close();
  });
});