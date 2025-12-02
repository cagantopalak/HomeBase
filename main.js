console.log('main.js v2 started');
/* ---------- RESTORE SAVED BACKGROUND IMMEDIATELY ---------- */
// Simple browser API polyfill for Chrome (maps promise-based browser.* to chrome.*)
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = {};
  // Storage (only local used here)
  browser.storage = {
    local: {
      get: (keys) => new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (items) => {
          if (chrome.runtime && chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
          resolve(items);
        });
      }),
      set: (obj) => new Promise((resolve, reject) => {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime && chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
          resolve();
        });
      }),
      remove: (key) => new Promise((resolve, reject) => {
        // chrome.storage.local.remove accepts string or array
        chrome.storage.local.remove(key, () => {
          if (chrome.runtime && chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
          resolve();
        });
      }),
      clear: () => new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
          if (chrome.runtime && chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
          resolve();
        })
      })
    }
  };

  // Tabs
  browser.tabs = {
    query: (queryInfo) => new Promise((resolve) => chrome.tabs.query(queryInfo, (tabs) => resolve(tabs))),
    create: (createProperties) => new Promise((resolve) => chrome.tabs.create(createProperties, (tab) => resolve(tab)))
  };

  // runtime
  browser.runtime = {
    sendMessage: (msg) => new Promise((resolve, reject) => chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        // Common non-fatal error when popup closes: "The message port closed before a response was received." Treat as no-response rather than a hard rejection.
        const errMsg = String(chrome.runtime.lastError.message || chrome.runtime.lastError);
        if (errMsg.includes('The message port closed') || errMsg.includes('message port closed')) {
          // resolve undefined so callers don't get an unhandled rejection
          return resolve(undefined);
        }
        return reject(new Error(errMsg));
      }
      resolve(res);
    })),
    onMessage: chrome.runtime.onMessage
  };

  // Fallback for other APIs if needed
  browser.runtime.getURL = chrome.runtime.getURL.bind(chrome.runtime);
}

const defaultBackground = 'https://www.windowslatest.com/wp-content/uploads/2024/10/Windows-XP-4K-modified.jpg';
// Asynchronous function to load background
async function loadBackground() {
  let savedBg = null;
  // Priority: browser.storage (persistent) -> sessionStorage (session-only) -> localStorage (legacy) -> default
  if (typeof browser !== 'undefined' && browser.storage) {
    try {
      const result = await browser.storage.local.get('customBackground');
      savedBg = result.customBackground || sessionStorage.getItem('sessionCustomBackground') || localStorage.getItem('customBackground');
    } catch (error) {
      console.error('Error loading background from browser.storage:', error);
      savedBg = sessionStorage.getItem('sessionCustomBackground') || localStorage.getItem('customBackground');
    }
  } else {
    savedBg = sessionStorage.getItem('sessionCustomBackground') || localStorage.getItem('customBackground');
  }

  if (savedBg) {
    document.body.style.background = `url('${savedBg}') center/cover no-repeat fixed`;
  } else {
    document.body.style.background = `url('${defaultBackground}') center/cover no-repeat fixed`;
  }
}

// Resize a dataURL image to fit within maxWidth/maxHeight and return a new dataURL.
function resizeImageDataUrl(dataUrl, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      let ratio = Math.min(1, Math.min(maxWidth / width, maxHeight / height));
      if (ratio >= 1) return resolve(dataUrl); // already small enough

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Determine output type (prefer jpeg if original is large PNG to reduce size)
      const isPng = dataUrl.startsWith('data:image/png');
      const outType = isPng ? 'image/jpeg' : 'image/jpeg';
      try {
        const out = canvas.toDataURL(outType, quality);
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(new Error('Image load error'));
    img.src = dataUrl;
  });
}

// Run the async function
loadBackground();

/* ---------- IMMEDIATE STYLE APPLICATION FROM LOCAL STORAGE ---------- */
function rgbaToHex(rgba) {
  const parts = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!parts) return '#ffffff';
  let r = parseInt(parts[1]).toString(16).padStart(2, '0');
  let g = parseInt(parts[2]).toString(16).padStart(2, '0');
  let b = parseInt(parts[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgba(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},0.7)`; // Changed to 0.7
}

function hexToRgbaAlpha(hex, alpha = 0.4) {
  if (!hex || hex.charAt(0) !== '#') return `rgba(255,255,255,${alpha})`;
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function getMainTileHex() {
  if (!savedTileColor) return '#ffffff';
  // If savedTileColor already a hex (#...), return it
  if (typeof savedTileColor === 'string' && savedTileColor.startsWith('#')) return savedTileColor;
  // Otherwise assume rgba(...) and convert
  try { return rgbaToHex(savedTileColor); } catch (e) { return '#ffffff'; }
}

const savedTextColor = localStorage.getItem('textColor');
const savedTileColor = localStorage.getItem('tileColor');
const savedFontFamily = localStorage.getItem('fontFamily');
const savedSoundVolume = parseFloat(localStorage.getItem('soundVolume')) || 0.5; // Changed from 0.06 to 0.5
const savedTilePlacement = localStorage.getItem('tilePlacement') || 'top'; // new: 'top' or 'middle'

let pendingTilePlacement = null;
let pendingSoundVolume = null;
let pendingShowClock = null;


// Helper: ensure tiles container sits per placement and search visibility
function applyTilePlacement() {
  const bodyEl = document.body;
  const tilesContainer = document.getElementById('tilesContainer');

  // always read current setting from storage so changes take effect immediately
  const placement = (pendingTilePlacement !== null && typeof pendingTilePlacement !== 'undefined')
    ? pendingTilePlacement
    : (localStorage.getItem('tilePlacement') || 'top');

  if (placement === 'middle') {
    // center the tiles vertically
    bodyEl.style.alignItems = 'center';
    bodyEl.style.paddingTop = '0px';
    if (tilesContainer) tilesContainer.style.marginTop = '';
  } else {
    // top placement (existing behavior)
    bodyEl.style.alignItems = 'flex-start';
    // fixed small top padding (search bar removed)
    bodyEl.style.paddingTop = '10px';
    if (tilesContainer) tilesContainer.style.marginTop = '';
  }
}

// Helper: ensure tiles container sits 10px from top when search is hidden
function updateTilesPositionBasedOnSearchBar() {
  applyTilePlacement();
}

if (savedTextColor) {
  document.documentElement.style.setProperty('--tile-label-color', savedTextColor);
}
if (savedFontFamily) {
  document.documentElement.style.setProperty('--tile-label-font-family', savedFontFamily);
}

if (savedTileColor) {
  document.documentElement.style.setProperty('--tile-bg-color', savedTileColor);
  document.documentElement.style.setProperty('--tile-border-color', savedTileColor.replace('0.4)', '0.5)'));
} else {
  document.documentElement.style.setProperty('--tile-bg-color', 'rgba(255,255,255,0.4)');
  document.documentElement.style.setProperty('--tile-border-color', 'rgba(255,255,255,0.5)');
}

// Apply saved tile border width (default to 2px)
const _savedTileBorderWidth = localStorage.getItem('tileBorderWidth') || '0px';
document.documentElement.style.setProperty('--tile-border-width', _savedTileBorderWidth);
// Set folder icon border width: 0px if tile border is 0px, otherwise 2px
const _folderIconBorderWidth = (_savedTileBorderWidth === '0px') ? '0px' : '2px';
document.documentElement.style.setProperty('--folder-icon-border-width', _folderIconBorderWidth);

// Search bar removed: no DOM element to toggle. Just apply placement rules.
applyTilePlacement();

/* ---------- AUDIO SETUP ---------- */
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// Get the saved slider value. If it's -1, then the actual audio volume is 0.
// Otherwise, the actual audio volume is the saved value.
let savedSliderValue = parseFloat(localStorage.getItem('soundVolume'));
let currentVolume = (isNaN(savedSliderValue) || savedSliderValue < 0) ? 0.5 : savedSliderValue; // Changed from 0 to 0.5

// Immediately suspend if volume is 0 on load
if (currentVolume === 0 && audioCtx.state === 'running') {
  audioCtx.suspend().catch(e => console.error('Initial suspend failed:', e));
}

/* ---------- AUDIO FUNCTIONS ---------- */
function playTone(freq, dur) {
  if (currentVolume <= 0) return; // This check now uses the actual gain value

  // Ensure audio context is running before playing a tone
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = currentVolume; // Use currentVolume for gain
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.stop(audioCtx.currentTime + dur);
    }).catch(e => console.error('Audio resume failed:', e));
  } else {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = currentVolume; // Use currentVolume for gain
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.stop(audioCtx.currentTime + dur);
  }
}

const hoverSound = () => playTone(500, 0.06);
const clickSound = () => playTone(180, 0.08);

/* ---------- SOUND SLIDER SETUP ---------- */
// Update an input[type=range] background to visually show filled progress in
// WebKit browsers (Chrome/Edge/Safari) so it matches Firefox's ::-moz-range-progress.
function updateRangeBackground(el) {
  if (!el || el.tagName !== 'INPUT' || el.type !== 'range') return;
  const style = getComputedStyle(document.documentElement);
  const fillColor = style.getPropertyValue('--button-primary-bg') || '#6366f1';
  const trackColor = style.getPropertyValue('--input-border-dark') || 'rgba(255,255,255,0.2)';
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 1;
  let val = parseFloat(el.value);
  if (isNaN(val)) val = min;
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  // Use a gradient where left part is fillColor up to pct%, then trackColor
  // Draw the gradient but limit its vertical size so it only covers the track area
  el.style.background = `linear-gradient(90deg, ${fillColor} ${pct}%, ${trackColor} ${pct}%)`;
  // Size the background to the track height (6px) and center it vertically
  el.style.backgroundSize = `100% 6px`;
  el.style.backgroundPosition = `0 50%`;
  el.style.backgroundRepeat = `no-repeat`;
}

function setupSoundSlider() {
  const volumeSlider = document.getElementById('soundVolumeInput');

  if (!volumeSlider) return;

  // Determine initial slider value: prefer pending preview value, otherwise use saved value or currentVolume
  const savedSliderFromLS = parseFloat(localStorage.getItem('soundVolume'));
  const initialSlider = (pendingSoundVolume !== null)
    ? pendingSoundVolume
    : (!isNaN(savedSliderFromLS) ? savedSliderFromLS : (currentVolume === 0 ? -1 : currentVolume));

  volumeSlider.value = initialSlider;
  // ensure visual fill matches value on init
  try { updateRangeBackground(volumeSlider); } catch (e) { }

  volumeSlider.addEventListener('input', (e) => {
    const sliderValue = parseFloat(e.target.value);

    // Preview only — store in pending and apply audio preview immediately
    pendingSoundVolume = sliderValue;

    if (sliderValue <= -1) { // If slider is at -1 or less, actual audio volume is 0
      currentVolume = 0;
      if (audioCtx.state === 'running') {
        audioCtx.suspend().catch(e => console.error('Suspend failed:', e));
      }
    } else { // Slider value is > -1
      currentVolume = sliderValue; // currentVolume is now the actual gain value (preview)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.error('Resume failed:', e));
      }
    }
    // Do NOT persist to localStorage here — Save will persist.
    // Update the visual fill so Chrome shows progress similar to Firefox.
    try { updateRangeBackground(e.target); } catch (err) { }
  });

  // Also apply/update for any other range inputs so they show progress consistently
  document.querySelectorAll('input[type=range]').forEach(r => {
    if (r === volumeSlider) return; // already handled
    try { updateRangeBackground(r); } catch (e) { }
    r.addEventListener('input', () => { try { updateRangeBackground(r); } catch (e) { } });
  });
}

/* ---------- TILE MANAGEMENT ---------- */
let links = [];
let stickyNotes = []; // Array to store sticky notes

// If running as an extension with browser.storage, use that
if (typeof browser !== 'undefined' && browser.storage) {
  browser.storage.local.get(['tiles', 'stickyNotes']).then(result => {
    if (result.tiles && result.tiles.length > 0) {
      links = result.tiles;
    } else {
      // fallback to localStorage if extension storage is empty
      links = JSON.parse(localStorage.getItem("tiles") || "[]");
    }

    if (result.stickyNotes) {
      stickyNotes = result.stickyNotes;
    } else {
      stickyNotes = JSON.parse(localStorage.getItem("stickyNotes") || "[]");
    }

    renderTiles();
    renderStickyNotes();
  }).catch(err => {
    console.error('Storage get failed, falling back to localStorage:', err);
    links = JSON.parse(localStorage.getItem("tiles") || "[]");
    stickyNotes = JSON.parse(localStorage.getItem("stickyNotes") || "[]");
    renderTiles();
    renderStickyNotes();
  });
} else {
  // Not in extension context — just use localStorage
  links = JSON.parse(localStorage.getItem("tiles") || "[]");
  stickyNotes = JSON.parse(localStorage.getItem("stickyNotes") || "[]");
  renderTiles();
  renderStickyNotes();
}

let editIndex = null;


const container = document.getElementById('tilesContainer');
const modal = document.getElementById('siteModal');
const modalTitle = document.getElementById('modalTitle');
const nameInput = document.getElementById('siteName');
const urlInput = document.getElementById('siteURL');
const iconInput = document.getElementById('siteIcon');
const saveBtn = document.getElementById('saveSite');
const cancelBtn = document.getElementById('cancelSite');

// --- NEW: Folder Modal elements ---
const folderModal = document.getElementById('folderModal');
const folderNameInput = document.getElementById('folderNameInput');
const saveFolderBtn = document.getElementById('saveFolderBtn');
const cancelFolderBtn = document.getElementById('cancelFolderBtn');
const folderColorInput = document.getElementById('folderColorInput');
const resetFolderColorBtn = document.getElementById('resetFolderColorBtn');
let folderEditIndex = null;

if (resetFolderColorBtn && folderColorInput) {
  resetFolderColorBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    // Put the main tile color into the picker for preview
    const mainHex = getMainTileHex();
    folderColorInput.value = mainHex;
    // Use dataset flag so save handler knows to remove folder color override
    folderColorInput.dataset.useDefault = '1';
    // small visual feedback
    resetFolderColorBtn.classList.add('active-reset');
  });
}

const favicon = url => `https://www.google.com/s2/favicons?sz=64&domain_url=${new URL(url).hostname}`;
// Helper: produce a visible two-line version of a name where each line is <= maxChars
function formatVisibleName(fullName, maxChars = 18, maxLines = 2) {
  if (!fullName) return [''];
  const words = String(fullName).split(/\s+/);
  const lines = [];
  let current = '';

  const pushLine = (line) => {
    if (lines.length >= maxLines) return;
    lines.push(line);
  };

  for (let w of words) {
    if (current.length === 0) {
      // start a new line with the word, possibly breaking it
      while (w.length > maxChars) {
        // word too long for one line — chop it
        pushLine(w.slice(0, maxChars));
        w = w.slice(maxChars);
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) break;
      current = w;
    } else {
      // try adding with a space
      if ((current.length + 1 + w.length) <= maxChars) {
        current = current + ' ' + w;
      } else {
        // push current line and start new one with w (may need chopping)
        pushLine(current);
        current = '';
        while (w.length > maxChars) {
          pushLine(w.slice(0, maxChars));
          w = w.slice(maxChars);
          if (lines.length >= maxLines) break;
        }
        if (lines.length >= maxLines) break;
        current = w;
      }
    }
  }
  if (lines.length < maxLines && current !== '') pushLine(current);

  // If we had more content than fits, append ellipsis to last visible line.
  const reconstructed = lines.join('\n');
  // Check whether original needs truncation by rebuilding from lines and comparing
  const visibleCombined = reconstructed.replace(/\n/g, ' ');
  const originalCompact = String(fullName).replace(/\s+/g, ' ').trim();
  if (originalCompact.length > visibleCombined.length) {
    // we truncated; add ellipsis to last line ensuring it doesn't exceed maxChars
    const lastIdx = Math.min(lines.length - 1, maxLines - 1);
    let last = lines[lastIdx] || '';
    // ensure room for one ellipsis char
    if (last.length >= maxChars) {
      last = last.slice(0, maxChars - 1);
    }
    last = last + '…';
    lines[lastIdx] = last;
  }

  // Guarantee each line is at most maxChars
  return lines.map(l => l.slice(0, maxChars));
}

// Minimal HTML escaper for label.innerHTML usage
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderTiles() {
  // Clear existing tiles completely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Rebuild all tiles
  links.forEach((link, i) => {
    const tile = buildTile(link, i, links);
    container.appendChild(tile);
  });

  // Add "Add Tile" button
  container.appendChild(buildAddButton());

  // Save without triggering another render
  persist(false);
}

function buildAddButton() {
  const btn = document.createElement('div');
  btn.className = 'tile add-tile';
  btn.textContent = '+';
  btn.onclick = () => {
    nameInput.value = '';
    urlInput.value = '';
    iconInput.value = '';
    modalTitle.textContent = 'Add a Site';
    editIndex = null;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
  };
  return btn;
}

// Add these variables at the top with other variables
let activeFolder = null;
const folderBubble = document.createElement('div');
folderBubble.className = 'folder-bubble';
const folderOverlay = document.createElement('div');
folderOverlay.className = 'folder-overlay';
document.body.appendChild(folderBubble);
document.body.appendChild(folderOverlay);

function buildTile(link, index, parentLinks = links) {
  if (link.type === 'folder') {
    return buildFolderTile(link, index);
  }

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.width = '180px';

  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.draggable = true;
  tile.dataset.index = index;
  // Capture the index value so event handlers use a stable reference
  const selfIndex = index;

  // Append elements
  const img = document.createElement('img');
  img.src = link.icon || favicon(link.url);
  img.alt = "";
  img.style.width = '48px';
  img.style.height = '48px';
  img.style.userSelect = 'none';
  img.onerror = () => {
    img.src = 'img/icon_48.png';
  };
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = 'flex';
  anchor.style.flexDirection = 'column';
  anchor.style.alignItems = 'center';
  anchor.appendChild(img);
  tile.appendChild(anchor);

  // --- DRAG EVENTS ---
  if (parentLinks === links) {
    tile.addEventListener('dragstart', function (e) {
      const idx = (typeof selfIndex !== 'undefined') ? selfIndex : +this.dataset.index;
      dragStartIndex = idx;
      dragCurrentIndex = idx;
      isDragging = true;
      dragOverStartTime = null;
      this.classList.add('dragging');
      reorderOccurred = false;
      setTimeout(() => this.classList.add('placeholder'), 0);

      if (parentLinks !== links) {
        dragFromFolder = true;
      }
    });

    tile.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!isDragging) return;
      // Don't interact with self if we haven't moved
      if (selfIndex === dragCurrentIndex && !dragFromFolder) return;

      // 1. Calculate Position for "Folder Hover" vs "Reorder"
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      // Dynamic Threshold:
      // If target is a folder, use a larger "center" zone (80%) to make it easier to drop in.
      // If target is a file (creating new folder), use smaller zone (50%) to avoid accidental creation.
      const targetIsFolder = links[selfIndex] && links[selfIndex].type === 'folder';
      const threshold = targetIsFolder ? 0.1 : 0.25; // 10% edge vs 25% edge

      const isCenter = (x > w * threshold && x < w * (1 - threshold) &&
        y > h * threshold && y < h * (1 - threshold));

      // Only allow folder creation if:
      // - Not dragging a folder (cannot nest folders)
      // - Target is not the dragged item itself
      // - We are in the center zone
      const canCreateFolder = (!links[dragStartIndex] || links[dragStartIndex].type !== 'folder') &&
        !dragFromFolder;

      if (isCenter && canCreateFolder) {
        this.classList.add('folder-hover');
        // Reset reorder timer so we don't swap while trying to create folder
        dragOverStartTime = null;
        return;
      } else {
        this.classList.remove('folder-hover');
      }

      // 2. Reorder Logic
      // If we are NOT in center (or can't create folder), we check for reorder.

      // IMPORTANT: If the target IS a folder, we want to be careful.
      // If we are dragging a FILE, we likely want to add it to the folder, so block reordering
      // to make dropping easier (user must drop in center, but edge shouldn't jump away).
      // If we are dragging a FOLDER, we can't nest it, so we MUST allow reordering.
      const isDraggingFolder = links[dragStartIndex] && links[dragStartIndex].type === 'folder';
      const isTargetFolder = links[selfIndex] && links[selfIndex].type === 'folder';

      if (isTargetFolder && !isDraggingFolder) {
        return;
      }

      if (!dragOverStartTime) dragOverStartTime = Date.now();
      const hoverDuration = Date.now() - dragOverStartTime;

      if (hoverDuration > 200) { // Slightly increased delay for stability
        links = arrayMove(links, dragCurrentIndex, selfIndex);
        dragCurrentIndex = selfIndex;
        renderTiles();
        reorderOccurred = true;
      }
    });

    tile.addEventListener('dragleave', function (e) {
      this.classList.remove('folder-hover');
      dragOverStartTime = null;
    });

    tile.addEventListener('drop', function (e) {
      e.preventDefault();
      this.classList.remove('folder-hover');

      // Folder Creation / Add
      // If we are hovering a folder-target
      if (!dragFromFolder &&
        dragStartIndex !== null &&
        dragStartIndex !== selfIndex &&
        (!links[dragStartIndex] || links[dragStartIndex].type !== 'folder')
      ) {

        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const w = rect.width;
        const h = rect.height;

        const targetIsFolder = links[selfIndex] && links[selfIndex].type === 'folder';
        const threshold = targetIsFolder ? 0.1 : 0.25;

        const isCenter = (x > w * threshold && x < w * (1 - threshold) &&
          y > h * threshold && y < h * (1 - threshold));

        if (isCenter) {
          // Create Folder or Add to Folder
          const sourceItem = links[dragStartIndex];
          const targetItem = links[selfIndex];

          if (targetItem.type === 'folder') {
            // Add to existing folder
            targetItem.links.push(sourceItem);
            links.splice(dragStartIndex, 1);
          } else {
            // Create new folder
            const folder = {
              type: 'folder',
              name: 'Folder',
              links: [targetItem, sourceItem]
            };
            // Replace target with folder
            if (dragStartIndex < selfIndex) {
              links.splice(selfIndex, 1, folder);
              links.splice(dragStartIndex, 1);
            } else {
              links.splice(dragStartIndex, 1);
              links.splice(selfIndex, 1, folder);
            }
          }
          persist();
          isDragging = false;
          dragStartIndex = null;
          dragCurrentIndex = null;
          return;
        }
      }

      // Fallback: Finish Reorder
      isDragging = false;
      dragStartIndex = null;
      dragCurrentIndex = null;
      persist();
    });

    tile.addEventListener('dragend', function (e) {
      isDragging = false;
      dragStartIndex = null;
      dragCurrentIndex = null;
      dragOverStartTime = null;
      reorderOccurred = false;
      persist();
    });
  }

  // Sound effects
  tile.addEventListener('mouseenter', hoverSound, { passive: true });
  // Click handler
  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-buttons')) return;
    e.preventDefault();      // stop <a> default
    e.stopPropagation();     // stop bubbling to other handlers
    window.location.href = link.url; // same tab
  });



  // Context menu
  tile.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, link, index);
  });

  const label = document.createElement('span');
  label.className = 'tile-label';
  // preserve full name but only show up to 2 visible lines of <=18 chars each
  label.dataset.fullname = link.name || '';
  label.title = link.name || '';
  label.style.whiteSpace = 'pre-line';
  const visible = formatVisibleName(link.name || '');
  label.innerHTML = visible.map(escapeHtml).join('<br>');

  label.className = label.className || 'tile-label';
  label.className = 'tile-label';
  label.style.width = '100%';
  label.style.textAlign = 'center';
  label.style.marginTop = '8px';
  label.style.userSelect = 'none';
  label.style.color = 'var(--tile-label-color, white)';
  label.style.fontFamily = 'var(--tile-label-font-family, "Inter", sans-serif)';

  wrapper.appendChild(tile);
  wrapper.appendChild(label);

  return wrapper;
}

// Minimal showContextMenu implementation (used for regular tiles)
function showContextMenu(e, link, index) {
  try {
    hideAllContextMenus();
    ctxMenu.innerHTML = `
        <button id="ctxEdit">✎ Edit</button>
        <button id="ctxDelete">🗑 Delete</button>`;
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.display = 'block';

    const editBtnEl = document.getElementById('ctxEdit');
    const delBtnEl = document.getElementById('ctxDelete');
    if (editBtnEl) editBtnEl.onclick = () => { window.editSite(index); hideAllContextMenus(); };
    if (delBtnEl) delBtnEl.onclick = () => { window.deleteSite(index); hideAllContextMenus(); };
  } catch (err) {
    console.warn('showContextMenu error', err);
  }
}

const TILE_BG_ALPHA = 0.7;
const TILE_BORDER_ALPHA = 0.6;

function buildFolderTile(folder, index) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.width = '180px';

  const tile = document.createElement('div');
  tile.className = 'tile folder-tile';
  tile.draggable = true;
  tile.dataset.index = index;
  tile.dataset.type = 'folder';
  const selfFolderIndex = index;

  // Apply folder-specific color (if set) to tile background/border using same alpha as main tiles
  if (folder.colorHex) {
    tile.style.background = hexToRgbaAlpha(folder.colorHex, TILE_BG_ALPHA);
    tile.style.borderColor = hexToRgbaAlpha(folder.colorHex, TILE_BORDER_ALPHA);
    // remove additional blur to keep visuals identical to regular tiles
    tile.style.backdropFilter = 'none';
  } else {
    tile.style.background = '';
    tile.style.borderColor = '';
    tile.style.backdropFilter = '';
  }

  // Create 2x2 grid of first 4 icons (previews) - non-interactive and match folder tile color exactly
  const iconGrid = document.createElement('div');
  iconGrid.className = 'folder-icon-grid';
  folder.links.slice(0, 4).forEach(link => {
    const iconDiv = document.createElement('div');
    iconDiv.className = 'folder-icon';

    iconDiv.style.pointerEvents = 'none';
    iconDiv.style.cursor = 'default';
    iconDiv.style.backdropFilter = 'none';
    if (folder.colorHex) {
      iconDiv.style.background = hexToRgbaAlpha(folder.colorHex, TILE_BG_ALPHA);
      iconDiv.style.borderColor = hexToRgbaAlpha(folder.colorHex, TILE_BORDER_ALPHA);
    } else {
      iconDiv.style.background = '';
      iconDiv.style.borderColor = '';
    }

    const img = document.createElement('img');
    img.src = link.icon || favicon(link.url);
    img.alt = "";
    img.style.width = '24px';
    img.style.height = '24px';
    img.draggable = false;
    img.style.pointerEvents = 'none';
    iconDiv.appendChild(img);
    iconGrid.appendChild(iconDiv);
  });

  while (iconGrid.children.length < 4) {
    const iconDiv = document.createElement('div');
    iconDiv.className = 'folder-icon';
    iconDiv.style.pointerEvents = 'none';
    iconDiv.style.cursor = 'default';
    iconDiv.style.backdropFilter = 'none';
    if (folder.colorHex) {
      iconDiv.style.background = hexToRgbaAlpha(folder.colorHex, 0.14);
      iconDiv.style.borderColor = hexToRgbaAlpha(folder.colorHex, 0.22);
    } else {
      iconDiv.style.background = 'var(--tile-bg-color)';
      iconDiv.style.borderColor = 'var(--tile-border-color)';
    }
    iconGrid.appendChild(iconDiv);
  }
  tile.appendChild(iconGrid);

  // --- DRAG EVENTS ---
  tile.addEventListener('dragstart', function (e) {
    dragStartIndex = selfFolderIndex;
    dragCurrentIndex = selfFolderIndex;
    isDragging = true;
    dragOverStartTime = null;
    // Reset reorder flag for this drag session
    reorderOccurred = false;
    this.classList.add('dragging');
    setTimeout(() => this.classList.add('placeholder'), 0);
  });

  tile.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (!isDragging || selfFolderIndex === dragCurrentIndex) return;

    // 1. Calculate Position for "Folder Hover" vs "Reorder"
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    // Use a large "center" zone (90% of tile) for folders to make it easy to drop in
    const threshold = 0.1;
    const isCenter = (x > w * threshold && x < w * (1 - threshold) &&
      y > h * threshold && y < h * (1 - threshold));

    // Check if we are dragging a file (can be added to folder)
    // Must be a top-level file (not from another folder)
    const isDraggingFile = !dragFromFolder && links[dragStartIndex] && links[dragStartIndex].type !== 'folder';

    if (isCenter && isDraggingFile) {
      this.classList.add('folder-hover');
      // Reset reorder timer so we don't swap while trying to add to folder
      dragOverStartTime = null;
      return;
    } else {
      this.classList.remove('folder-hover');
    }

    // 2. Reorder Logic
    // If we are dragging a folder, always treat as reorder (cannot nest folders)
    if (!isDraggingFile) {
      links = arrayMove(links, dragCurrentIndex, selfFolderIndex);
      dragCurrentIndex = selfFolderIndex;
      folderWasMoved = true;
      renderTiles();
      reorderOccurred = true;
      return;
    }

    // If we are dragging a FILE but are on the EDGE, we reorder.
    if (!dragOverStartTime) dragOverStartTime = Date.now();
    const hoverDuration = Date.now() - dragOverStartTime;

    if (hoverDuration > 300) {
      links = arrayMove(links, dragCurrentIndex, selfFolderIndex);
      dragCurrentIndex = selfFolderIndex;
      folderWasMoved = true;
      renderTiles();
      reorderOccurred = true;
    }
  });

  tile.addEventListener('dragleave', function (e) {
    this.classList.remove('folder-hover');
    dragOverStartTime = null;
  });

  tile.addEventListener('drop', function (e) {
    e.preventDefault();
    this.classList.remove('folder-hover');

    // Calculate position again to be sure
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const threshold = 0.1;
    const isCenter = (x > w * threshold && x < w * (1 - threshold) &&
      y > h * threshold && y < h * (1 - threshold));

    // Check if we are dragging a file (can be added to folder)
    const isDraggingFile = !dragFromFolder && links[dragStartIndex] && links[dragStartIndex].type !== 'folder';

    if (
      isCenter &&
      isDraggingFile &&
      dragStartIndex !== null &&
      dragStartIndex !== selfFolderIndex &&
      !reorderOccurred
    ) {
      // Move the tile into the folder
      const moved = links.splice(dragStartIndex, 1)[0];
      folder.links = folder.links || [];
      folder.links.push(moved);
      persist(false);
      isDragging = false;
      dragStartIndex = null;
      // Ensure moved tiles are unhidden and classes cleared after reorder
      document.querySelectorAll('.tile').forEach(t => {
        t.classList.remove('dragging', 'moving', 'placeholder');
      });

      // Re-render to show the file inside the folder (update icon grid)
      renderTiles();
    }
  });

  tile.addEventListener('dragend', function (e) {
    isDragging = false;
    dragStartIndex = null;
    dragCurrentIndex = null;
    dragOverStartTime = nulls;
    // Ensure tiles are visible after drag finishes
    document.querySelectorAll('.tile').forEach(t => {
      t.classList.remove('dragging', 'moving', 'placeholder');
    });

    // If the user moved the folder, don't open it on dragend. Otherwise open like a click.
    if (!folderWasMoved) {
      openFolder(folder, selfFolderIndex);
    }
    // reset flag for next interactions
    // also reset reorder flag
    reorderOccurred = false;
    folderWasMoved = false;
  });

  // Click handler
  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-buttons')) return;
    openFolder(folder, index);
  });

  // Context menu
  tile.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showFolderContextMenu(e, folder, index);
  });

  // Sound effects
  tile.addEventListener('mouseenter', hoverSound, { passive: true });
  tile.addEventListener('mousedown', clickSound, { passive: true });

  // Create label
  const label = document.createElement('span');
  // preserve full folder name but only show up to 2 visible lines of <=18 chars each
  label.className = 'tile-label';
  label.dataset.fullname = folder.name || '';
  label.title = folder.name || '';
  label.style.whiteSpace = 'pre-line';
  const folderVisible = formatVisibleName(folder.name || '');
  label.innerHTML = folderVisible.map(escapeHtml).join('<br>');
  label.style.width = '100%';
  label.style.textAlign = 'center';
  label.style.marginTop = '8px';
  label.style.userSelect = 'none';
  label.style.color = 'var(--tile-label-color, white)';
  label.style.fontFamily = 'var(--tile-label-font-family, "Inter", sans-serif)';

  // Append to wrapper
  wrapper.appendChild(tile);
  wrapper.appendChild(label);

  return wrapper;
}
function buildAddButton() {
  const btn = document.createElement('div');
  btn.className = 'tile add-tile';
  btn.textContent = '+';
  btn.addEventListener('click', () => openModal());
  btn.addEventListener('mouseenter', hoverSound, { passive: true });
  btn.addEventListener('mousedown', clickSound, { passive: true });
  return btn;
}

function openModal(edit = false) {
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  modalTitle.textContent = edit ? 'Edit Site' : 'Add a Site';
  if (!edit) {
    nameInput.value = urlInput.value = iconInput.value = '';
    editIndex = null;
  }
  nameInput.focus();
}

function closeModal() {
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

saveBtn.onclick = () => {
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const icon = iconInput.value.trim();

  if (!name) return;

  if (editIndex !== null) {
    if (links[editIndex].type === 'folder') {
      links[editIndex].name = name;
    } else {
      links[editIndex] = { name, url, icon };
    }
  } else {
    if (url) {
      links.push({ name, url, icon });
    } else {
      links.push({ type: 'folder', name, links: [] });
    }
  }

  persist();
  closeModal();
};

cancelBtn.onclick = closeModal;
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

window.editSite = idx => {
  const link = links[idx];
  nameInput.value = link.name;
  urlInput.value = link.url;
  iconInput.value = link.icon || '';
  editIndex = idx;
  openModal(true);
};

window.deleteSite = idx => {
  showCustomConfirm('Delete this tile?', () => {
    links.splice(idx, 1);
    // Persist and re-render immediately so the change appears without a full reload
    persist();
  });
};

let dragStartIndex = null;
let dragCurrentIndex = null;
let isDragging = false;
let dragOverTimer = null;
let dragOverStartTime = null;
// When dragging folders we set this so dragend handlers know a move occurred
let folderWasMoved = false;
// Whether any reorder occurred during the current drag session
let reorderOccurred = false;
// Folder-specific drag state
let folderDragStartIndex = null;
let folderDragOverStartTime = null;
let folderIsDragging = false;
// When dragging a tile out from a folder to the main grid
let dragFromFolder = false;


function arrayMove(arr, from, to) {
  if (from === to) return arr;
  const newArr = arr.slice();
  const item = newArr.splice(from, 1)[0];
  newArr.splice(to, 0, item);
  return newArr;
}

function dragStart(e) {
  dragStartIndex = +this.dataset.index;
  this.classList.add('dragging');
  setTimeout(() => this.classList.add('placeholder'), 0);
}
function dragOver(e) {
  e.preventDefault();
  const overIndex = +this.dataset.index;
  if (overIndex === dragStartIndex) return;

  dragOverIndex = overIndex;
  // Remove previous move indicators
  document.querySelectorAll('.tile').forEach(tile => tile.classList.remove('moving'));
  // Add move indicator to the hovered tile
  this.classList.add('moving');
}
function dragLeave(e) {
  this.classList.remove('moving');
}
function drop(e) {
  e.preventDefault();
  const overIndex = +this.dataset.index;
  if (overIndex === dragStartIndex) return;

  // Move the dragged tile to the new position
  const moved = links.splice(dragStartIndex, 1)[0];
  links.splice(overIndex, 0, moved);

  // Reset drag state
  dragStartIndex = null;
  dragOverIndex = null;
  document.querySelectorAll('.tile').forEach(tile => {
    tile.classList.remove('dragging', 'moving', 'placeholder');
  });
  persist(false);
}
function dragEnd(e) {
  this.classList.remove('dragging');
  this.classList.remove('placeholder');
  document.querySelectorAll('.tile').forEach(tile => tile.classList.remove('moving'));
}

document.addEventListener('dragover', (e) => {
  if (activeFolder && !e.target.closest('.folder-bubble')) {
    e.preventDefault();
    // Allow dropping outside the folder
    e.dataTransfer.dropEffect = 'move';
  }
});

document.addEventListener('drop', (e) => {
  if (!activeFolder || e.target.closest('.folder-bubble')) {
    return;
  }
  e.preventDefault();
  // If dragging from folder bubble
  if (dragFromFolder && dragStartIndex !== null) {
    const moved = activeFolder.folder.links.splice(dragStartIndex, 1)[0];
    // Prevent moving folders between folders
    if (moved.type === 'folder') {
      showCustomAlert("You can't move folders between folders.");
      return;
    }
    links.push(moved);
    // If folder is now empty, remove it and close the bubble
    if (activeFolder.folder.links.length === 0) {
      links.splice(activeFolder.index, 1);
      persist(false);
      closeFolder();
    } else {
      persist(false);
      // Keep folder open and re-render it
      openFolder(activeFolder.folder, activeFolder.index);
    }
    dragFromFolder = false;
    dragStartIndex = null;
    return;
  }
});


function persist(rerender = true) {
  const tilesToSave = links.map(link => {
    if (link.type === 'folder') {
      return { ...link, links: link.links };
    }
    return link;
  });
  if (typeof browser !== 'undefined' && browser.storage) {
    browser.storage.local.set({ tiles: tilesToSave }).then(() => {
      console.log('Tiles saved to local storage');
      if (rerender) {
        renderTiles();
      }
    }).catch(error => {
      console.error('Error saving tiles to local storage:', error);
    });
  } else {
    localStorage.setItem('tiles', JSON.stringify(tilesToSave));
    console.log('Tiles saved to local storage');
    if (rerender) {
      renderTiles();
    }
  }
}

/* ---------- FOLDER FUNCTIONS ---------- */
// Add function to open folder
function openFolder(folder, index) {
  activeFolder = { folder, index };
  folderBubble.innerHTML = '';

  // Create inner bubble wrapper for content (clipped)
  const innerBubble = document.createElement('div');
  innerBubble.className = 'folder-bubble-inner';

  // Apply folder-specific color to the INNER bubble
  if (folder.colorHex) {
    innerBubble.style.background = hexToRgbaAlpha(folder.colorHex, TILE_BG_ALPHA);
    innerBubble.style.borderColor = hexToRgbaAlpha(folder.colorHex, TILE_BORDER_ALPHA);
    innerBubble.style.backdropFilter = 'none';
  } else {
    innerBubble.style.background = '';
    innerBubble.style.borderColor = '';
    innerBubble.style.backdropFilter = '';
  }

  // Fix: Ensure folder bubble text uses the selected font family
  folderBubble.style.fontFamily = 'var(--tile-label-font-family)';

  // Create header container
  const header = document.createElement('div');
  header.className = 'folder-header-outside';
  header.style.position = 'absolute';
  header.style.top = '-60px'; // Position above the bubble
  header.style.left = '0';
  header.style.width = '100%';
  header.style.textAlign = 'center';

  // Create title element
  const title = document.createElement('h2');
  title.textContent = folder.name || 'Folder';
  title.style.margin = '0';
  title.style.fontSize = '2rem';
  title.style.fontWeight = '600';
  title.style.color = 'white';
  title.style.textShadow = '0 2px 10px rgba(0,0,0,0.5)';
  title.style.cursor = 'pointer';
  title.style.display = 'inline-block';
  title.title = 'Click to edit folder settings';

  // Add click handler to open settings
  title.onclick = (e) => {
    e.stopPropagation(); // Prevent closing the folder bubble
    openFolderEditModal(folder, index);
  };

  header.appendChild(title);
  folderBubble.appendChild(header); // Append to bubble so it moves with it

  const folderLinksContainer = document.createElement('div');
  folderLinksContainer.className = 'folder-tiles-container'

  folder.links.forEach((link, i) => {
    const localI = i;
    const parentFolderIndex = index;
    const tileWrapper = buildTile(link, localI, folder.links, index);
    tileWrapper.style.margin = '0';

    // Ensure the tile element inside this wrapper matches the folder color exactly
    const innerTile = tileWrapper.querySelector('.tile');
    if (innerTile) {
      innerTile.style.backdropFilter = 'none';
      if (folder.colorHex) {
        innerTile.style.background = hexToRgbaAlpha(folder.colorHex, TILE_BG_ALPHA);
        innerTile.style.borderColor = hexToRgbaAlpha(folder.colorHex, TILE_BORDER_ALPHA);
      } else {
        innerTile.style.background = '';
        innerTile.style.borderColor = '';
      }
    }

    // Make small preview boxes inside each inner tile match folder color too
    const innerTiles = tileWrapper.querySelectorAll('.folder-icon');
    innerTiles.forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.backdropFilter = 'none';
      if (folder.colorHex) {
        el.style.background = hexToRgbaAlpha(folder.colorHex, TILE_BG_ALPHA);
        el.style.borderColor = hexToRgbaAlpha(folder.colorHex, TILE_BORDER_ALPHA);
      } else {
        el.style.background = '';
        el.style.borderColor = '';
      }
    });


    // --- DRAG EVENTS for tiles inside folder bubble ---
    const tileDiv = tileWrapper.querySelector('.tile');
    if (tileDiv) {
      // Ensure draggable (might already be set by buildTile)
      tileDiv.draggable = true;

      // Start dragging from inside folder
      tileDiv.addEventListener('dragstart', function (e) {
        // Record folder-local index and mark dragging
        folderDragStartIndex = localI;
        folderIsDragging = true;
        tileDiv.classList.add('dragging');
        // Reset reorder flag for this drag session (dragging out from folder)
        reorderOccurred = false;
        // mark as placeholder after a tick so layout stabilizes (avoid visibility:hidden)
        setTimeout(() => tileDiv.classList.add('placeholder'), 0);

        // Also set global indicators so dropping on main grid knows source
        dragStartIndex = localI; // index relative to the folder.links when dragging out
        dragFromFolder = true;
        // Store a reference to the folder in global activeFolder for drop handlers
        // activeFolder is already set when opening the folder
      });

      // Drag over another tile inside the folder -> immediate reorder preview
      tileDiv.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (!folderIsDragging || folderDragStartIndex === null || localI === folderDragStartIndex) return;

        // Perform immediate reorder in the folder's data array
        const moved = folder.links.splice(folderDragStartIndex, 1)[0];
        folder.links.splice(localI, 0, moved);
        // Update the start index to the new location
        folderDragStartIndex = localI;
        persist(false);
        // Re-open folder to reflect order change and keep the dragged element hidden
        openFolder(folder, parentFolderIndex);
        // Keep the dragged tile hidden
        const tiles = folderLinksContainer.querySelectorAll('.tile');
        // Keep the dragged tile hidden via its original element's classes.
        // Do NOT apply 'placeholder' to shifted tiles here — they must remain fully visible.
      });

      tileDiv.addEventListener('dragleave', function (e) {
        // no-op; reorder happens on dragover
      });

      // If dropped inside the folder area, finalize
      tileDiv.addEventListener('drop', function (e) {
        e.preventDefault();
        folderIsDragging = false;
        folderDragStartIndex = null;
        dragFromFolder = false;
        openFolder(folder, parentFolderIndex);
      });

      tileDiv.addEventListener('dragend', function (e) {
        tileDiv.classList.remove('dragging');
        tileDiv.classList.remove('placeholder');
        folderIsDragging = false;
        folderDragStartIndex = null;
        dragFromFolder = false;
        // reset reorder flag
        reorderOccurred = false;
      });
    }

    // Context menu for tiles inside folder bubble (unchanged)
    tileWrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideAllContextMenus();
      ctxMenu.innerHTML = `
        <button id="ctxEdit">✎ Edit</button>
        <button id="ctxDelete">🗑 Delete</button>`;
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.display = 'block';

      document.getElementById('ctxEdit').onclick = () => {
        nameInput.value = link.name;
        urlInput.value = link.url;
        iconInput.value = link.icon || '';
        editIndex = localI;
        openModal(true);
        const originalSaveHandler = saveBtn.onclick;
        saveBtn.onclick = () => {
          const name = nameInput.value.trim();
          const url = urlInput.value.trim();
          const icon = iconInput.value.trim();
          if (!name || !url) return;
          activeFolder.folder.links[localI] = { name, url, icon };
          persist(false);
          closeModal();
          openFolder(activeFolder.folder, activeFolder.index);
          saveBtn.onclick = originalSaveHandler;
        };
        hideAllContextMenus();
      };
      document.getElementById('ctxDelete').onclick = () => {
        showCustomConfirm('Delete this tile?', () => {
          activeFolder.folder.links.splice(localI, 1);
          persist(false);
          openFolder(activeFolder.folder, activeFolder.index);
        });
        hideAllContextMenus();
      };
    });

    folderLinksContainer.appendChild(tileWrapper);
  });



  innerBubble.appendChild(folderLinksContainer);
  folderBubble.appendChild(innerBubble);
  folderOverlay.style.display = 'block';
  folderBubble.style.display = 'block';
}
// 'dragFromFolder' is declared near the other drag state variables above

// Update your document drop handler to this:
document.addEventListener('drop', (e) => {
  if (!activeFolder || e.target.closest('.folder-bubble')) {
    return;
  }
  e.preventDefault();
  // If dragging from folder bubble
  if (dragFromFolder && dragStartIndex !== null) {
    const moved = activeFolder.folder.links.splice(dragStartIndex, 1)[0];
    // Prevent moving folders between folders
    if (moved.type === 'folder') {
      showCustomAlert("You can't move folders between folders.");
      return;
    }
    links.push(moved);
    if (activeFolder.folder.links.length === 0) {
      links.splice(activeFolder.index, 1);
    }
    persist(false);
    closeFolder();
    dragFromFolder = false;
    dragStartIndex = null;
    return;
  }
});

// Reset ALL colors (global + per-folder) to defaults and update UI
function resetAllColors() {
  // Remove saved main color
  localStorage.removeItem('tileColor');
  // Default values
  const defaultTileBg = 'rgba(255,255,255,0.4)';
  const defaultTileBorder = 'rgba(255,255,255,0.5)';

  // Apply CSS vars immediately
  document.documentElement.style.setProperty('--tile-bg-color', defaultTileBg);
  document.documentElement.style.setProperty('--tile-border-color', defaultTileBorder);
  document.documentElement.style.setProperty('--tile-label-color', '#FFFFFF');

  // Remove per-folder overrides
  let changed = false;
  links.forEach(item => {
    if (item && item.type === 'folder' && item.colorHex) {
      delete item.colorHex;
      changed = true;
    }
  });

  // Persist and re-render immediately so inline styles and grid update
  persist();

  // Clear any inline styles so folders use CSS vars now
  clearAllFolderInlineStylesIfNoOverride();

  // Update settings inputs if present
  if (tileColorInput) tileColorInput.value = rgbaToHex(defaultTileBg);
  if (textColorInput) textColorInput.value = '#FFFFFF';
  if (clockColorInput) clockColorInput.value = '#FFFFFF';

  // Refresh open folder bubble if any
  if (activeFolder) openFolder(activeFolder.folder, activeFolder.index);
}

// Hook the static button in newtab.html (if present)
const resetColorsBtnStatic = document.getElementById('resetColorsBtn');
if (resetColorsBtnStatic) {
  resetColorsBtnStatic.addEventListener('click', (ev) => {
    ev.preventDefault();
    showCustomConfirm('Reset all colors to defaults? This will also remove individual folder colors.', () => {
      resetAllColors();
      showCustomAlert('All colors reset to defaults.');
    });
  });
}

function openModalForFolder(folder, folderIndex) {
  openModal(); // Open the regular modal
  modalTitle.textContent = `Add to ${folder.name}`;
  saveBtn.onclick = () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const icon = iconInput.value.trim();
    if (!name || !url) return;

    // Add the new tile to the specific folder's links array
    folder.links.push({ name, url, icon });
    persist(false); // Persist the updated main links array (which contains the modified folder)
    closeModal();
    openFolder(folder, folderIndex); // Re-open the folder to show new tile
  };
}


// Add function to close folder
function closeFolder() {
  folderOverlay.style.display = 'none';
  folderBubble.style.display = 'none';

  activeFolder = null;
  renderTiles(); // Re-render main grid to ensure correct state after folder interaction
}

function openFolderEditModal(folder, index) {
  folderEditIndex = index;
  folderModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  folderNameInput.value = folder.name || '';

  if (folder.colorHex) {
    // Ensure we have a valid 7-char hex for the input
    let safeHex = folder.colorHex;
    if (safeHex.length !== 7 && safeHex.startsWith('#')) {
      // simplistic fix if needed, or just fallback
    }
    folderColorInput.value = safeHex;
    folderColorInput.removeAttribute('data-use-default');
    delete folderColorInput.dataset.useDefault;
    if (resetFolderColorBtn) resetFolderColorBtn.classList.remove('active-reset');
  } else {
    // show main tile color so user sees what resetting will do
    const mainHex = getMainTileHex();
    folderColorInput.value = (mainHex && mainHex.length === 7) ? mainHex : '#ffffff';
    folderColorInput.dataset.useDefault = '1';
    if (resetFolderColorBtn) resetFolderColorBtn.classList.add('active-reset');
  }

  folderNameInput.focus();
}


function closeFolderEditModal() {
  folderEditIndex = null;
  folderModal.style.display = 'none';
  document.body.classList.remove('modal-open');
  if (folderColorInput) {
    delete folderColorInput.dataset.useDefault;
    if (resetFolderColorBtn) resetFolderColorBtn.classList.remove('active-reset');
  }
}

if (saveFolderBtn) {
  saveFolderBtn.onclick = () => {
    const name = folderNameInput.value.trim();

    // Must have an edit target
    if (folderEditIndex === null) return;

    // Save name only if provided (allow color-only changes)
    if (name) links[folderEditIndex].name = name;

    // Respect the reset flag: if dataset.useDefault === '1', remove override so folder follows main color
    if (folderColorInput && folderColorInput.dataset.useDefault === '1') {
      delete links[folderEditIndex].colorHex;
    } else if (folderColorInput && folderColorInput.value) {
      // Save explicit hex color
      links[folderEditIndex].colorHex = folderColorInput.value;
    }

    // Persist and re-render so folder name/color updates appear immediately
    persist();

    // If the edited folder is currently open, re-open to update bubble (including header)
    if (activeFolder && activeFolder.index === folderEditIndex) {
      openFolder(links[folderEditIndex], folderEditIndex);
    }
    closeFolderEditModal();
  };
}


if (cancelFolderBtn) {
  cancelFolderBtn.onclick = closeFolderEditModal;
}


// Add click handler for overlay
folderOverlay.addEventListener('click', closeFolder);


function showFolderContextMenu(e, folder, index) {
  e.preventDefault();
  hideAllContextMenus();

  ctxMenu.innerHTML = `
        <button id="ctxEdit">✎ Edit</button>
        <button id="ctxDelete">🗑 Delete</button>
    `;
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.display = 'block';

  document.getElementById('ctxEdit').onclick = () => {
    openFolderEditModal(folder, index); // Use the new folder-specific modal
    hideAllContextMenus();
  };

  document.getElementById('ctxDelete').onclick = () => {
    showCustomConfirm('Delete this folder and all its contents?', () => {
      links.splice(index, 1);
      // Persist and re-render immediately so the folder disappears without reload
      persist();
    });
    hideAllContextMenus();
  };
}

function editFolder(folder, index) {
  // Set modal values
  editIndex = index;
  nameInput.value = folder.name;
  urlInput.value = '';
  iconInput.value = '';

  // Hide URL and icon fields for folder editing
  const siteURLGroupEl = document.getElementById('siteURLGroup');
  const siteIconGroupEl = document.getElementById('siteIconGroup');
  if (siteURLGroupEl) siteURLGroupEl.style.display = 'none';
  if (siteIconGroupEl) siteIconGroupEl.style.display = 'none';

  // Update modal title
  modalTitle.textContent = 'Edit Folder';

  // Open the modal
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  // Save the original handler so we can restore it
  const originalSaveHandler = saveBtn.onclick;

  // Set up the save handler for folder renaming
  saveBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) return;

    // Update folder name
    folder.name = name;
    // Re-render after renaming so main grid and any open folder reflect change immediately
    persist();

    // Restore original save handler and fields
    saveBtn.onclick = originalSaveHandler;
    if (siteURLGroupEl) siteURLGroupEl.style.display = 'block';
    if (siteIconGroupEl) siteIconGroupEl.style.display = 'block';
    closeModal();
    // If a folder bubble is open, re-render it to update the name
    if (activeFolder && activeFolder.index === index) {
      openFolder(folder, index);
    }
  };
}


function closeModal() {
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  const siteURLGroupEl = document.getElementById('siteURLGroup');
  const siteIconGroupEl = document.getElementById('siteIconGroup');
  if (siteURLGroupEl) siteURLGroupEl.style.display = 'block';
  if (siteIconGroupEl) siteIconGroupEl.style.display = 'block';
  editIndex = null;
}


cancelBtn.onclick = closeModal;
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); // Calls the global closeModal
    closeFolderEditModal(); // Close folder edit modal if open
    // Also close other modals here as needed
    resetConfirmModal.style.display = 'none';
    exportConfirmModal.style.display = 'none';
    contactModal.style.display = 'none';
    document.body.classList.remove('modal-open');
    closeFolder(); // Also close folder bubble
  }
});

/* ---------- SETTINGS MODAL ---------- */
const editBtn = document.getElementById('editBtn');
const editModal = document.getElementById('editModal');
const textColorInput = document.getElementById('textColorInput');
const tileColorInput = document.getElementById('tileColorInput');
const bgFileInput = document.getElementById('bgFileInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const fontFamilySelect = document.getElementById('fontFamilySelect');
const resetBgBtn = document.getElementById('resetBgBtn');
const soundVolumeInput = document.getElementById('soundVolumeInput');
const resetAllSettingsBtn = document.getElementById('resetAllSettingsBtn'); // Existing Reset All Button
const browseBgButton = document.getElementById('browseBgButton');
const tileBorderWidthSelect = document.getElementById('tileBorderWidthSelect');

const newDigitalClock = document.getElementById('new-digital-clock');
const showClockToggle = document.getElementById('showClockToggle');
const clockColorInput = document.getElementById('clockColorInput');
const clockFontFamilySelect = document.getElementById('clockFontFamilySelect');
const clockFormatSelect = document.getElementById('clockFormatSelect');
const showSecondsToggle = document.getElementById('showSecondsToggle');
const clockSizeInput = document.getElementById('clockSizeInput');
const clockPositionSelect = document.getElementById('clockPositionSelect');

// New: Export and Import buttons
const exportBtn = document.getElementById('exportBtn'); // Renamed to exportTriggerBtn
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');

// New: Reset Confirmation Modal Elements
const resetConfirmModal = document.getElementById('resetConfirmModal');
const resetAllSettingsAndLinksBtn = document.getElementById('resetAllSettingsAndLinksBtn');
const resetAllSettingsOnlyBtn = document.getElementById('resetAllSettingsOnlyBtn');
const resetAllLinksOnlyBtn = document.getElementById('resetAllLinksOnlyBtn'); // NEW REFERENCE
const cancelResetOptionsBtn = document.getElementById('cancelResetOptionsBtn');

// New: Export Confirmation Modal Elements
const exportConfirmModal = document.getElementById('exportConfirmModal');
const exportAllSettingsAndLinksBtn = document.getElementById('exportAllSettingsAndLinksBtn');
const exportAllSettingsOnlyBtn = document.getElementById('exportAllSettingsOnlyBtn');
const exportAllLinksOnlyBtn = document.getElementById('exportAllLinksOnlyBtn');
const cancelExportOptionsBtn = document.getElementById('cancelExportOptionsBtn');



let savedShowClock = localStorage.getItem('showClock') === 'false' ? false : true;
let savedClockColor = localStorage.getItem('clockColor') || '#FFFFFF';
let savedClockFontFamily = localStorage.getItem('clockFontFamily') || "'Climate Crisis', cursive";
let savedClockFormat = localStorage.getItem('clockFormat') || '24';
let savedShowSeconds = localStorage.getItem('showSeconds') === 'true' ? true : false;
// Clock size in px (stored as number), default 64 (≈4em)
let savedClockSize = parseInt(localStorage.getItem('clockSize')) || 64;
// Clock position: 'left' or 'right'
let savedClockPosition = localStorage.getItem('clockPosition') || 'left';

function updateNewDigitalClock() {
  if (!newDigitalClock) return;

  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  let timeString;

  if (savedClockFormat === '12') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    if (savedShowSeconds) {
      timeString += `:${seconds.toString().padStart(2, '0')}`;
    }
    timeString += ` ${ampm}`;
  } else {
    timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    if (savedShowSeconds) {
      timeString += `:${seconds.toString().padStart(2, '0')}`;
    }
  }
  newDigitalClock.textContent = timeString;
}

function applyClockSettings() {
  document.documentElement.style.setProperty('--clock-display-color', savedClockColor);
  document.documentElement.style.setProperty('--clock-display-font-family', savedClockFontFamily);
  // apply size
  document.documentElement.style.setProperty('--clock-font-size', (savedClockSize ? savedClockSize + 'px' : '4em'));

  // apply position via helper classes
  if (newDigitalClock) {
    newDigitalClock.classList.remove('clock-pos-left', 'clock-pos-right');
    if (savedClockPosition === 'right') newDigitalClock.classList.add('clock-pos-right');
    else newDigitalClock.classList.add('clock-pos-left');
  }

  // Prefer pending (preview) showClock when editing
  const showClockNow = (pendingShowClock !== null) ? pendingShowClock : (localStorage.getItem('showClock') !== 'false' ? true : false);

  if (newDigitalClock) {
    newDigitalClock.style.display = showClockNow ? 'flex' : 'none';
  }
  updateNewDigitalClock();
}

applyClockSettings();
let newClockInterval = setInterval(updateNewDigitalClock, 1000);

showClockToggle.addEventListener('change', (e) => {
  // Preview change only — don't persist until Save is pressed
  pendingShowClock = e.target.checked;
  applyClockSettings();
});

clockColorInput.addEventListener('input', (e) => {
  savedClockColor = e.target.value;
  document.documentElement.style.setProperty('--clock-display-color', savedClockColor);
});





showSecondsToggle.addEventListener('change', (e) => {
  savedShowSeconds = e.target.checked;
  updateNewDigitalClock();
});

// Clock size preview (doesn't persist until Save)
if (clockSizeInput) {
  // initialize UI
  clockSizeInput.value = savedClockSize;
  clockSizeInput.addEventListener('input', (e) => {
    savedClockSize = parseInt(e.target.value) || 64;
    document.documentElement.style.setProperty('--clock-font-size', savedClockSize + 'px');
  });
}

const editButtonContextMenu = document.getElementById('editButtonContextMenu');

function showEditButtonAt(x, y) {
  editButtonContextMenu.style.top = y + 'px';
  editButtonContextMenu.style.left = x + 'px';
  editButtonContextMenu.style.display = 'block';
}

function hideEditButton() {
  editButtonContextMenu.style.display = 'none';
}

function hideAllContextMenus() {
  editButtonContextMenu.style.display = 'none';
  if (typeof ctxMenu !== 'undefined' && ctxMenu) {
    ctxMenu.style.display = 'none';
  }
  resetConfirmModal.style.display = 'none';
  contactModal.style.display = 'none'; // Add this line
  document.body.classList.remove('modal-open');
}

function openEditModal() {
  textColorInput.value = localStorage.getItem('textColor') || '#FFFFFF';
  const savedTileColorModal = localStorage.getItem('tileColor') || 'rgba(255,255,255,0.4)';
  tileColorInput.value = rgbaToHex(savedTileColorModal);

  const currentFontFamily = localStorage.getItem('fontFamily');
  if (currentFontFamily) {
    fontFamilySelect.value = currentFontFamily;
  } else {
    fontFamilySelect.value = "'Roboto', sans-serif";
  }
  refreshCustomDropdown('fontFamilyDropdown', 'fontFamilySelect');

  clockColorInput.value = savedClockColor;
  if (savedClockFontFamily) {
    clockFontFamilySelect.value = savedClockFontFamily;
  } else {
    clockFontFamilySelect.value = "'Climate Crisis', cursive";
  }
  refreshCustomDropdown('clockFontFamilyDropdown', 'clockFontFamilySelect');

  // Use savedShowClock (not pending) to initialize the toggle UI
  // Use savedShowClock (not pending) to initialize the toggle UI
  showClockToggle.checked = localStorage.getItem('showClock') !== 'false';

  clockFormatSelect.value = savedClockFormat;
  refreshCustomDropdown('clockFormatDropdown', 'clockFormatSelect');

  showSecondsToggle.checked = savedShowSeconds;

  // Initialize Clock Position
  if (clockPositionSelect) {
    clockPositionSelect.value = savedClockPosition;
    refreshCustomDropdown('clockPositionDropdown', 'clockPositionSelect');
  }

  // Search bar option removed; nothing to initialize here.

  // new: set placement select UI
  const currentPlacement = localStorage.getItem('tilePlacement') || 'top';
  if (tilePlacementSelect) {
    tilePlacementSelect.value = currentPlacement;
    refreshCustomDropdown('tilePlacementDropdown', 'tilePlacementSelect');
  }

  // Initialize tile border width select
  if (tileBorderWidthSelect) {
    const currentBorder = localStorage.getItem('tileBorderWidth') || '0px';
    tileBorderWidthSelect.value = currentBorder;
    refreshCustomDropdown('tileBorderWidthDropdown', 'tileBorderWidthSelect');
  }

  setupSoundSlider(); // Call setupSoundSlider to initialize slider state

  // Ensure the clock settings collapsible is closed when opening settings
  const clockSettingsGroup = document.getElementById('clockSettingsGroup');
  if (clockSettingsGroup) {
    clockSettingsGroup.classList.remove('open');
    const content = clockSettingsGroup.querySelector('.collapsible-content');
    if (content) {
      content.style.maxHeight = '0px';
      content.style.opacity = '0';
      content.style.paddingTop = '0px';
    }
  }

  editModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  hideEditButton();
}

function closeEditModal() {
  editModal.style.display = 'none';
  document.body.classList.remove('modal-open');

  // Reset any pending previews so the real saved values are reapplied
  pendingTilePlacement = null;
  pendingSoundVolume = null;
  pendingShowClock = null;

  // Revert tile placement to saved state
  applyTilePlacement();

  document.documentElement.style.setProperty('--tile-label-color', localStorage.getItem('textColor') || '#FFFFFF');
  document.documentElement.style.setProperty('--tile-label-font-family', localStorage.getItem('fontFamily') || "'Roboto', sans-serif");
  const savedTileColorOnCancel = localStorage.getItem('tileColor') || 'rgba(255,255,255,0.4)';
  document.documentElement.style.setProperty('--tile-bg-color', savedTileColorOnCancel);
  document.documentElement.style.setProperty('--tile-border-color', savedTileColorOnCancel.replace('0.4)', '0.5)'));

  // Search bar removed; nothing to restore here.

  // Restore saved sound volume state (revert any preview)
  const savedSliderValue = parseFloat(localStorage.getItem('soundVolume'));
  currentVolume = (isNaN(savedSliderValue) || savedSliderValue < 0) ? 0 : savedSliderValue;
  if (currentVolume === 0 && audioCtx.state === 'running') {
    audioCtx.suspend().catch(e => console.error('Suspend failed on close:', e));
  } else if (currentVolume > 0 && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.error('Resume failed on close:', e));
  }

  // Restore saved clock settings
  savedShowClock = localStorage.getItem('showClock') === 'false' ? false : true;
  savedClockColor = localStorage.getItem('clockColor') || '#FFFFFF';
  savedClockFontFamily = localStorage.getItem('clockFontFamily') || "'Climate Crisis', cursive";
  savedClockFormat = localStorage.getItem('clockFormat') || '24';
  savedShowSeconds = localStorage.getItem('showSeconds') === 'true' ? true : false;
  applyClockSettings();

  // adjust tiles position after applying search visibility / placement
  applyTilePlacement();

  // Re-evaluate currentVolume and audioCtx state on modal close based on the saved slider value
  const savedSliderValueOnClose = parseFloat(localStorage.getItem('soundVolume'));
  currentVolume = (isNaN(savedSliderValueOnClose) || savedSliderValueOnClose < 0) ? 0 : savedSliderValueOnClose;

  if (currentVolume === 0 && audioCtx.state === 'running') {
    audioCtx.suspend().catch(e => console.error('Suspend failed on close:', e));
  } else if (currentVolume > 0 && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.error('Resume failed on close:', e));
  }


  savedShowClock = localStorage.getItem('showClock') === 'false' ? false : true;
  savedClockColor = localStorage.getItem('clockColor') || '#FFFFFF';
  savedClockFontFamily = localStorage.getItem('clockFontFamily') || "'Climate Crisis', cursive";
  savedClockFormat = localStorage.getItem('clockFormat') || '24';
  savedShowSeconds = localStorage.getItem('showSeconds') === 'true' ? true : false;
  applyClockSettings();
}

cancelSettingsBtn.addEventListener('click', closeEditModal);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeEditModal();
    // Also close the new reset confirmation modal if open
    resetConfirmModal.style.display = 'none';
    exportConfirmModal.style.display = 'none'; // Also close export modal
    contactModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
});

browseBgButton.addEventListener('click', () => {
  bgFileInput.click();
});

bgFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (event) {
    try {
      let dataUrl = event.target.result;
      // Resize if image is large
      try {
        dataUrl = await resizeImageDataUrl(dataUrl, 1920, 1080, 0.8);
      } catch (e) {
        console.warn('Resize failed or not needed:', e);
      }

      document.body.style.background = `url('${dataUrl}') center/cover no-repeat fixed`;
      // Persist safely
      try {
        await persistCustomBackground(dataUrl);
      } catch (e) {
        console.error('persistCustomBackground failed:', e);
        showCustomAlert('Background image could not be saved. It will be applied for this session only.');
        try { sessionStorage.setItem('sessionCustomBackground', dataUrl); } catch (e) { }
      }
    } catch (err) {
      console.error('Background processing failed:', err);
    }
  };
  reader.readAsDataURL(file);
});

const genericModal = document.createElement('div');
genericModal.className = 'modal';
genericModal.innerHTML = `
<div class="modal-content">
  <h2 id="genericModalTitle"></h2>
  <p id="genericModalMessage"></p>
  <div class="button-group" style="display:flex; justify-content:flex-end; gap:10px;"> <button id="genericModalConfirmBtn" class="primary-button" style="display:none;">OK</button> <button id="genericModalCancelBtn" class="secondary-button" style="display:none;">Cancel</button> <button id="genericModalCloseBtn" class="secondary-button">Close</button> </div>
</div>
`;
document.body.appendChild(genericModal);

const genericModalTitle = document.getElementById('genericModalTitle');
const genericModalMessage = document.getElementById('genericModalMessage');
const genericModalConfirmBtn = document.getElementById('genericModalConfirmBtn');
const genericModalCancelBtn = document.getElementById('genericModalCancelBtn');
const genericModalCloseBtn = document.getElementById('genericModalCloseBtn');

let confirmCallback = null;

function showCustomConfirm(message, onConfirm) {
  genericModalTitle.textContent = 'Confirm Action';
  genericModalMessage.textContent = message;
  genericModalConfirmBtn.style.display = 'inline-block';
  genericModalCancelBtn.style.display = 'inline-block';
  genericModalCloseBtn.style.display = 'none';
  genericModal.style.display = 'flex';
  document.body.classList.add('modal-open');

  genericModalConfirmBtn.onclick = () => {
    onConfirm();
    genericModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
  genericModalCancelBtn.onclick = () => {
    genericModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
}

function showCustomAlert(message) {
  genericModalTitle.textContent = 'Alert';
  genericModalMessage.textContent = message;
  genericModalConfirmBtn.style.display = 'none';
  genericModalCancelBtn.style.display = 'none';
  genericModalCloseBtn.style.display = 'inline-block';
  genericModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  genericModalCloseBtn.onclick = () => {
    genericModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
}

textColorInput.addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--tile-label-color', e.target.value);
});

tileColorInput.addEventListener('input', (e) => {
  const hex = e.target.value;
  const rgba = hexToRgba(hex);
  document.documentElement.style.setProperty('--tile-bg-color', rgba);
  document.documentElement.style.setProperty('--tile-border-color', rgba.replace('0.4)', '0.5)'));

  // Remove inline styles for folder tiles that have no colorHex so they reflect the CSS var immediately
  clearAllFolderInlineStylesIfNoOverride();
});



function clearFolderInlineStylesForIndex(idx) {
  const el = document.querySelector(`.tile.folder-tile[data-index="${idx}"]`);
  if (el) {
    el.style.background = '';
    el.style.borderColor = '';
    el.style.backdropFilter = '';
    el.querySelectorAll('.folder-icon').forEach(fi => {
      fi.style.background = '';
      fi.style.borderColor = '';
      fi.style.backdropFilter = '';
    });
  }
}

// Clear inline styles for all folder tiles that do NOT have a color override
function clearAllFolderInlineStylesIfNoOverride() {
  document.querySelectorAll('.tile.folder-tile').forEach(el => {
    const idx = el.dataset.index !== undefined ? parseInt(el.dataset.index, 10) : NaN;
    const folderObj = Number.isNaN(idx) ? null : links[idx];
    if (!folderObj || !folderObj.colorHex) {
      el.style.background = '';
      el.style.borderColor = '';
      el.style.backdropFilter = '';
      el.querySelectorAll('.folder-icon').forEach(fi => {
        fi.style.background = '';
        fi.style.borderColor = '';
        fi.style.backdropFilter = '';
      });
    }
  });

  // If a folder bubble is open and its folder has no color override, clear its inline styles too
  if (activeFolder && (!activeFolder.folder || !activeFolder.folder.colorHex)) {
    const inner = folderBubble.querySelector('.folder-bubble-inner');
    if (inner) {
      inner.style.background = '';
      inner.style.borderColor = '';
      inner.style.backdropFilter = '';
    }
    folderBubble.querySelectorAll('.tile').forEach(t => {
      t.style.background = '';
      t.style.borderColor = '';
      t.style.backdropFilter = '';
    });
    folderBubble.querySelectorAll('.folder-icon').forEach(fi => {
      fi.style.background = '';
      fi.style.borderColor = '';
      fi.style.backdropFilter = '';
    });
  }
}

// Reset button: now removes the folder override immediately and previews the real main color
if (resetFolderColorBtn && folderColorInput) {
  resetFolderColorBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (folderEditIndex === null) {
      // just set picker to main color for preview
      const mainHex = getMainTileHex();
      folderColorInput.value = mainHex;
      folderColorInput.dataset.useDefault = '1';
      resetFolderColorBtn.classList.add('active-reset');
      return;
    }

    // Remove stored override so folder behaves as if never edited
    if (links[folderEditIndex] && links[folderEditIndex].colorHex) {
      delete links[folderEditIndex].colorHex;
      persist(false); // persist but don't force full rerender now
    }

    // Update picker to show current main color and mark as default
    const mainHex = getMainTileHex();
    // Ensure mainHex is a valid 7-char hex before setting
    folderColorInput.value = (mainHex && mainHex.length === 7) ? mainHex : '#ffffff';
    folderColorInput.dataset.useDefault = '1';
    resetFolderColorBtn.classList.add('active-reset');

    // Clear any inline styles on the folder tile and open bubble so CSS var takes effect
    clearFolderInlineStylesForIndex(folderEditIndex);

    // If the folder bubble is open for this folder, update it to use main color (CSS var)
    if (activeFolder && activeFolder.index === folderEditIndex) {
      const inner = folderBubble.querySelector('.folder-bubble-inner');
      if (inner) {
        inner.style.background = '';
        inner.style.borderColor = '';
        inner.style.backdropFilter = '';
      }
      folderBubble.querySelectorAll('.tile').forEach(t => {
        t.style.background = '';
        t.style.borderColor = '';
        t.style.backdropFilter = '';
      });
      folderBubble.querySelectorAll('.folder-icon').forEach(fi => {
        fi.style.background = '';
        fi.style.borderColor = '';
        fi.style.backdropFilter = '';
      });
    }
  });
}

if (folderColorInput) {
  folderColorInput.addEventListener('input', (e) => {
    // Clear reset flag so Save will persist this custom color
    folderColorInput.removeAttribute('data-use-default');
    delete folderColorInput.dataset.useDefault;
    if (resetFolderColorBtn) resetFolderColorBtn.classList.remove('active-reset');

    const hex = e.target.value;
    if (!hex) return;

    const bg = hexToRgbaAlpha(hex, TILE_BG_ALPHA);
    const border = hexToRgbaAlpha(hex, TILE_BORDER_ALPHA);

    // Update the folder tile in the grid (if visible)
    if (folderEditIndex !== null) {
      const tileEl = document.querySelector(`.tile.folder-tile[data-index="${folderEditIndex}"]`);
      if (tileEl) {
        tileEl.style.background = bg;
        tileEl.style.borderColor = border;
        tileEl.style.backdropFilter = 'none';
        tileEl.querySelectorAll('.folder-icon').forEach(fi => {
          fi.style.background = bg;
          fi.style.borderColor = border;
          fi.style.backdropFilter = 'none';
        });
      }
    }

    // If the folder bubble is open for this folder, update it too
    if (activeFolder && folderEditIndex !== null && activeFolder.index === folderEditIndex) {
      const inner = folderBubble.querySelector('.folder-bubble-inner');
      if (inner) {
        inner.style.background = bg;
        inner.style.borderColor = border;
        inner.style.backdropFilter = 'none';
      }
      folderBubble.querySelectorAll('.tile').forEach(t => {
        t.style.background = bg;
        t.style.borderColor = border;
        t.style.backdropFilter = 'none';
      });
      folderBubble.querySelectorAll('.folder-icon').forEach(fi => {
        fi.style.background = bg;
        fi.style.borderColor = border;
        fi.style.backdropFilter = 'none';
      });
    }
  });
}

// === CUSTOM DROPDOWN LOGIC ===
function setupCustomDropdown(dropdownId, hiddenInputId, onChangeCallback) {
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!dropdown || !hiddenInput) return;

  const selectedDisplay = dropdown.querySelector('.dropdown-selected');
  const optionsContainer = dropdown.querySelector('.dropdown-options');
  const options = dropdown.querySelectorAll('.dropdown-option');
  const labelSpan = dropdown.querySelector('.current-font-label');

  // Toggle dropdown
  selectedDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns first
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
  });

  // Handle option click
  options.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      const label = option.textContent;

      // Update hidden input
      hiddenInput.value = value;

      // Update display
      labelSpan.textContent = label;

      // Update selected state
      options.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');

      // Close dropdown
      dropdown.classList.remove('open');

      // Trigger callback
      if (onChangeCallback) onChangeCallback(value);
    });
  });

  // Initial state from hidden input
  const initialValue = hiddenInput.value;
  const initialOption = Array.from(options).find(o => o.dataset.value === initialValue);
  if (initialOption) {
    labelSpan.textContent = initialOption.textContent;
    initialOption.classList.add('selected');
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
});

// Setup Font Family Dropdown
setupCustomDropdown('fontFamilyDropdown', 'fontFamilySelect', (value) => {
  document.documentElement.style.setProperty('--tile-label-font-family', value);
});

// Setup Clock Font Dropdown
setupCustomDropdown('clockFontFamilyDropdown', 'clockFontFamilySelect', (value) => {
  savedClockFontFamily = value;
  document.documentElement.style.setProperty('--clock-display-font-family', value);
});

// Setup Tile Border Width Dropdown
setupCustomDropdown('tileBorderWidthDropdown', 'tileBorderWidthSelect', (value) => {
  document.documentElement.style.setProperty('--tile-border-width', value);
  // Update folder icon border width preview: 0px -> 0px, others -> 2px
  const iconWidth = (value === '0px') ? '0px' : '2px';
  document.documentElement.style.setProperty('--folder-icon-border-width', iconWidth);
});

// Setup Tile Placement Dropdown
setupCustomDropdown('tilePlacementDropdown', 'tilePlacementSelect', (value) => {
  // Update pending value and apply immediately for preview
  pendingTilePlacement = value;
  applyTilePlacement();
});

// Setup Clock Format Dropdown
setupCustomDropdown('clockFormatDropdown', 'clockFormatSelect', (value) => {
  savedClockFormat = value;
  updateNewDigitalClock();
});

// Setup Clock Position Dropdown
setupCustomDropdown('clockPositionDropdown', 'clockPositionSelect', (value) => {
  savedClockPosition = value;
  if (newDigitalClock) {
    newDigitalClock.classList.remove('clock-pos-left', 'clock-pos-right');
    if (savedClockPosition === 'right') newDigitalClock.classList.add('clock-pos-right');
    else newDigitalClock.classList.add('clock-pos-left');
  }
});

function refreshCustomDropdown(dropdownId, hiddenInputId) {
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = document.getElementById(hiddenInputId);
  if (!dropdown || !hiddenInput) return;

  const options = dropdown.querySelectorAll('.dropdown-option');
  const labelSpan = dropdown.querySelector('.current-font-label');

  const val = hiddenInput.value;
  const option = Array.from(options).find(o => o.dataset.value === val);

  if (option) {
    labelSpan.textContent = option.textContent;
    options.forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
  }
}



saveSettingsBtn.addEventListener('click', () => {
  localStorage.setItem('textColor', textColorInput.value);
  localStorage.setItem('tileColor', document.documentElement.style.getPropertyValue('--tile-bg-color'));
  localStorage.setItem('fontFamily', fontFamilySelect.value);
  // Persist tile border width if select exists
  if (tileBorderWidthSelect) {
    const bw = tileBorderWidthSelect.value || '2px';
    localStorage.setItem('tileBorderWidth', bw);
    document.documentElement.style.setProperty('--tile-border-width', bw);
  }

  // Persist sound volume: prefer pending preview value if present, otherwise current slider value
  const soundToSave = (pendingSoundVolume !== null) ? pendingSoundVolume : (soundVolumeInput ? soundVolumeInput.value : (localStorage.getItem('soundVolume') || '0.5'));
  localStorage.setItem('soundVolume', soundToSave);

  // Persist display options that were only being previewed
  const placementToSave = (tilePlacementSelect && tilePlacementSelect.value) ? tilePlacementSelect.value : (pendingTilePlacement || 'top');
  localStorage.setItem('tilePlacement', placementToSave);

  // Search bar option removed; nothing to persist here.

  // Persist showClock: prefer pending preview if present
  const showClockToSave = (typeof pendingShowClock === 'boolean') ? pendingShowClock : (showClockToggle.checked);
  localStorage.setItem('showClock', showClockToSave ? 'true' : 'false');

  // clear pending preview state
  pendingTilePlacement = null;
  pendingSoundVolume = null;
  pendingShowClock = null;

  // apply placement immediately so no reload is required
  applyTilePlacement();
  // re-apply clock settings from saved values
  savedShowClock = localStorage.getItem('showClock') === 'false' ? false : true;
  applyClockSettings();

  localStorage.setItem('clockColor', savedClockColor);
  localStorage.setItem('clockFontFamily', savedClockFontFamily);
  localStorage.setItem('clockFormat', savedClockFormat);
  localStorage.setItem('showSeconds', savedShowSeconds);
  // Persist new clock settings
  localStorage.setItem('clockSize', savedClockSize);
  localStorage.setItem('clockPosition', savedClockPosition);

  // Ensure audioCtx state matches the saved volume immediately after save
  const savedSliderAfterSave = parseFloat(localStorage.getItem('soundVolume'));
  currentVolume = (isNaN(savedSliderAfterSave) || savedSliderAfterSave < 0) ? 0 : savedSliderAfterSave;
  if (currentVolume === 0 && audioCtx.state === 'running') {
    audioCtx.suspend().catch(e => console.error('Suspend failed after save:', e));
  } else if (currentVolume > 0 && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.error('Resume failed after save:', e));
  }

  closeEditModal();
});


/* ---------- RESET FUNCTIONALITY ---------- */
resetBgBtn.addEventListener('click', () => {
  showCustomConfirm('Are you sure you want to reset the background image to default?', async () => {
    if (typeof browser !== 'undefined' && browser.storage) {
      try {
        await browser.storage.local.remove('customBackground');
      } catch (error) {
        console.error('Error removing background from browser.storage:', error);
        // Fallback to localStorage on error
        localStorage.removeItem('customBackground');
      }
    } else {
      localStorage.removeItem('customBackground');
    }
    document.body.style.background = `url('${defaultBackground}') center/cover no-repeat fixed`;
  });
});

resetAllLinksOnlyBtn.addEventListener('click', () => {
  showCustomConfirm('Are you sure you want to reset ALL your saved links and sticky notes? Your custom settings (colors, fonts, background, etc.) will remain.', () => {
    localStorage.removeItem('tiles');
    localStorage.removeItem('stickyNotes');
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.local.remove(['tiles', 'stickyNotes']).then(() => {
        showCustomAlert('All links and notes have been reset! The page will now reload.');
        setTimeout(() => location.reload(), 1500);
      });
    } else {
      showCustomAlert('All links and notes have been reset! The page will now reload.');
      setTimeout(() => location.reload(), 1500);
    }
  });
});

resetAllSettingsBtn.addEventListener('click', () => {
  editModal.style.display = 'none';
  resetConfirmModal.style.display = 'flex';
  document.body.classList.add('modal-open');
});

resetAllSettingsAndLinksBtn.addEventListener('click', () => {
  showCustomConfirm('Are you sure you want to reset ALL settings and tiles to default? This will clear all custom colors, fonts, display options, background, AND all your saved links and sticky notes.', () => {
    localStorage.clear();
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.local.clear().then(() => {
        showCustomAlert('All settings and tiles have been reset! The page will now reload.');
        setTimeout(() => location.reload(), 1500);
      });
    } else {
      showCustomAlert('All settings and tiles have been reset! The page will now reload.');
      setTimeout(() => location.reload(), 1500);
    }
  });
});

resetAllSettingsOnlyBtn.addEventListener('click', () => {
  showCustomConfirm('Are you sure you want to reset ALL settings to default? This will clear all custom colors, fonts, display options, and background, but your saved links and sticky notes will remain.', async () => {
    const currentTiles = localStorage.getItem('tiles');
    const browserTiles = typeof browser !== 'undefined' && browser.storage ? browser.storage.local.get('tiles') : Promise.resolve({ tiles: null });

    try {

      await browserTiles; // Wait for the promise to resolve

      localStorage.removeItem('textColor');
      localStorage.removeItem('tileColor');
      localStorage.removeItem('fontFamily');
      localStorage.removeItem('soundVolume');
      localStorage.removeItem('clockColor');
      localStorage.removeItem('clockFontFamily');
      localStorage.removeItem('showClock');
      localStorage.removeItem('clockFormat');
      localStorage.removeItem('clockSize');
      localStorage.removeItem('clockPosition');
      localStorage.removeItem('showSeconds');
      localStorage.removeItem('tilePlacement');
      localStorage.removeItem('tileBorderWidth');

      // Also remove from browser.storage if available
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.remove([
          'customBackground', 'textColor', 'tileColor', 'fontFamily',
          'soundVolume', 'clockColor', 'clockFontFamily', 'showClock', 'clockFormat',
          'showSeconds', 'hasSeenWelcome', 'clockSize', 'clockPosition'
        ]);
      } else {
        localStorage.removeItem('customBackground');
      }

      showCustomAlert('All settings have been reset! The page will now reload.');
      setTimeout(() => location.reload(), 1500);
    } catch (error) {
      console.error("Error resetting settings:", error);
      showCustomAlert('An error occurred while resetting settings.');
    }
  });
});

cancelResetOptionsBtn.addEventListener('click', () => {
  resetConfirmModal.style.display = 'none';
  document.body.classList.remove('modal-open');
  openEditModal();
});

/* ---------- EXPORT/IMPORT FUNCTIONALITY ---------- */
exportBtn.addEventListener('click', () => {
  editModal.style.display = 'none';
  exportConfirmModal.style.display = 'flex';
  document.body.classList.add('modal-open');
});

// Export All Settings and Links
exportAllSettingsAndLinksBtn.addEventListener('click', () => {
  const getExportData = () => {
    if (typeof browser !== 'undefined' && browser.storage) {
      // fetch tiles and customBackground from browser.storage when available
      return browser.storage.local.get(['tiles', 'customBackground']).then(result => {
        return {
          version: 2,
          type: 'full',
          tiles: result.tiles || JSON.parse(localStorage.getItem('tiles') || '[]'),
          settings: {
            textColor: localStorage.getItem('textColor'),
            tileColor: localStorage.getItem('tileColor'),
            fontFamily: localStorage.getItem('fontFamily'),
            customBackground: result.customBackground || localStorage.getItem('customBackground'),
            soundVolume: localStorage.getItem('soundVolume'),
            showClock: localStorage.getItem('showClock'),
            tilePlacement: localStorage.getItem('tilePlacement') || 'top',
            tileBorderWidth: localStorage.getItem('tileBorderWidth') || '0px',
            clockColor: localStorage.getItem('clockColor'),
            clockFontFamily: localStorage.getItem('clockFontFamily'),
            clockFormat: localStorage.getItem('clockFormat'),
            showSeconds: localStorage.getItem('showSeconds'),
            clockSize: localStorage.getItem('clockSize'),
            clockSize: localStorage.getItem('clockSize'),
            clockPosition: localStorage.getItem('clockPosition')
          },
          stickyNotes: result.stickyNotes || JSON.parse(localStorage.getItem('stickyNotes') || '[]')
        };
      });
    }
    return Promise.resolve({
      version: 2,
      type: 'full',
      tiles: JSON.parse(localStorage.getItem('tiles') || '[]'),
      stickyNotes: JSON.parse(localStorage.getItem('stickyNotes') || '[]'),
      settings: {
        textColor: localStorage.getItem('textColor'),
        tileColor: localStorage.getItem('tileColor'),
        fontFamily: localStorage.getItem('fontFamily'),
        customBackground: localStorage.getItem('customBackground'),
        soundVolume: localStorage.getItem('soundVolume'),
        showClock: localStorage.getItem('showClock'),
        tilePlacement: localStorage.getItem('tilePlacement') || 'top',
        tileBorderWidth: localStorage.getItem('tileBorderWidth') || '0px',
        clockColor: localStorage.getItem('clockColor'),
        clockFontFamily: localStorage.getItem('clockFontFamily'),
        clockFormat: localStorage.getItem('clockFormat'),
        showSeconds: localStorage.getItem('showSeconds'),
        clockSize: localStorage.getItem('clockSize'),
        clockPosition: localStorage.getItem('clockPosition')
      }
    });
  };

  getExportData().then(data => {
    downloadJSON(data, 'HomeBase_FullBackup.json');
    showCustomAlert('All settings and links exported successfully!');
  });
});

// Export Settings Only
exportAllSettingsOnlyBtn.addEventListener('click', () => {
  const settings = {
    version: 2,
    type: 'settings',
    data: {
      textColor: localStorage.getItem('textColor'),
      tileColor: localStorage.getItem('tileColor'),
      fontFamily: localStorage.getItem('fontFamily'),
      customBackground: localStorage.getItem('customBackground'),
      soundVolume: localStorage.getItem('soundVolume'),
      showClock: localStorage.getItem('showClock'),
      tilePlacement: localStorage.getItem('tilePlacement') || 'top',
      tileBorderWidth: localStorage.getItem('tileBorderWidth') || '0px',
      clockColor: localStorage.getItem('clockColor'),
      clockFontFamily: localStorage.getItem('clockFontFamily'),
      clockFormat: localStorage.getItem('clockFormat'),
      showSeconds: localStorage.getItem('showSeconds'),
      clockSize: localStorage.getItem('clockSize'),
      clockPosition: localStorage.getItem('clockPosition')
    }
  };
  downloadJSON(settings, 'HomeBase_Settings.json');
  showCustomAlert('Settings exported successfully!');
});

// Export Links & Notes Only
exportAllLinksOnlyBtn.addEventListener('click', () => {
  const getData = () => {
    if (typeof browser !== 'undefined' && browser.storage) {
      return browser.storage.local.get(['tiles', 'stickyNotes']).then(result => {
        return {
          tiles: result.tiles || JSON.parse(localStorage.getItem('tiles') || '[]'),
          stickyNotes: result.stickyNotes || JSON.parse(localStorage.getItem('stickyNotes') || '[]')
        };
      });
    }
    return Promise.resolve({
      tiles: JSON.parse(localStorage.getItem('tiles') || '[]'),
      stickyNotes: JSON.parse(localStorage.getItem('stickyNotes') || '[]')
    });
  };

  getData().then(data => {
    const exportData = {
      version: 2,
      type: 'links',
      data: data.tiles,
      stickyNotes: data.stickyNotes
    };
    downloadJSON(exportData, 'HomeBase_LinksAndNotes.json');
    showCustomAlert('Links and Notes exported successfully!');
  });
});

// downloadJSON defined earlier; duplicate removed

cancelExportOptionsBtn.addEventListener('click', () => {
  exportConfirmModal.style.display = 'none';
  document.body.classList.remove('modal-open');
  openEditModal();
});

importBtn.addEventListener('click', () => {
  importInput.click();
});

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const importedData = JSON.parse(event.target.result);

      if (!importedData.type || !importedData.version) {
        showCustomAlert('Invalid import file: Missing type or version information');
        return;
      }

      showCustomConfirm('This will overwrite your current data. Continue?', () => {
        const importPromises = [];

        // Handle all import types
        switch (importedData.type) {
          case 'full': // Full backup (settings + links)
            if (importedData.settings) {
              // Handle customBackground specially so it's saved to browser.storage when available
              if (importedData.settings.customBackground) {
                const bg = importedData.settings.customBackground;
                // Apply background immediately so import shows visual change
                try { document.body.style.background = `url('${bg}') center/cover no-repeat fixed`; } catch (e) { }
                // Use helper to persist background safely
                importPromises.push(persistCustomBackground(bg));
              }

              // Persist tileBorderWidth and tilePlacement if present and other keys
              if (importedData.settings.tileBorderWidth) {
                const val = importedData.settings.tileBorderWidth;
                localStorage.setItem('tileBorderWidth', val);
                document.documentElement.style.setProperty('--tile-border-width', val);
                // Update folder icon border width preview: 0px -> 0px, others -> 1px
                const iconWidth = (val === '0px') ? '0px' : '1px';
                document.documentElement.style.setProperty('--folder-icon-border-width', iconWidth);
              }
              if (importedData.settings.tilePlacement) {
                localStorage.setItem('tilePlacement', importedData.settings.tilePlacement);
              }

              // Persist remaining simple settings
              Object.entries(importedData.settings).forEach(([key, value]) => {
                if (value === null || value === undefined) return;
                if (key === 'customBackground' || key === 'tileBorderWidth' || key === 'tilePlacement') return; // already handled
                localStorage.setItem(key, value);
              });

              // Apply clock size/position immediately for preview (they are now persisted to localStorage above)
              if (importedData.settings.clockSize) {
                try { document.documentElement.style.setProperty('--clock-font-size', importedData.settings.clockSize + 'px'); } catch (e) { }
              }
              if (importedData.settings.clockPosition && newDigitalClock) {
                newDigitalClock.classList.remove('clock-pos-left', 'clock-pos-right');
                if (importedData.settings.clockPosition === 'right') newDigitalClock.classList.add('clock-pos-right');
                else newDigitalClock.classList.add('clock-pos-left');
              }
            }

            if (importedData.tiles) {
              if (typeof browser !== 'undefined' && browser.storage) {
                importPromises.push(browser.storage.local.set({ tiles: importedData.tiles }));
              }
              localStorage.setItem('tiles', JSON.stringify(importedData.tiles));
            }

            if (importedData.stickyNotes) {
              if (typeof browser !== 'undefined' && browser.storage) {
                importPromises.push(browser.storage.local.set({ stickyNotes: importedData.stickyNotes }));
              }
              localStorage.setItem('stickyNotes', JSON.stringify(importedData.stickyNotes));
            }
            break;

          case 'settings': // Settings only
            if (importedData.data) {
              // Handle customBackground specially
              if (importedData.data.customBackground) {
                const bg = importedData.data.customBackground;
                try { document.body.style.background = `url('${bg}') center/cover no-repeat fixed`; } catch (e) { }
                importPromises.push(persistCustomBackground(bg));
              }

              if (importedData.data.tileBorderWidth) {
                localStorage.setItem('tileBorderWidth', importedData.data.tileBorderWidth);
                document.documentElement.style.setProperty('--tile-border-width', importedData.data.tileBorderWidth);
              }
              if (importedData.data.tilePlacement) {
                localStorage.setItem('tilePlacement', importedData.data.tilePlacement);
              }

              Object.entries(importedData.data).forEach(([key, value]) => {
                if (value === null || value === undefined) return;
                if (key === 'customBackground' || key === 'tileBorderWidth' || key === 'tilePlacement') return;
                localStorage.setItem(key, value);
              });

              // Apply clock size/position immediately for preview
              if (importedData.data.clockSize) {
                try { document.documentElement.style.setProperty('--clock-font-size', importedData.data.clockSize + 'px'); } catch (e) { }
              }
              if (importedData.data.clockPosition && newDigitalClock) {
                newDigitalClock.classList.remove('clock-pos-left', 'clock-pos-right');
                if (importedData.data.clockPosition === 'right') newDigitalClock.classList.add('clock-pos-right');
                else newDigitalClock.classList.add('clock-pos-left');
              }
            }
            break;

          case 'links': // Links & Notes
            if (importedData.data && Array.isArray(importedData.data)) {
              if (typeof browser !== 'undefined' && browser.storage) {
                importPromises.push(browser.storage.local.set({ tiles: importedData.data }));
              }
              localStorage.setItem('tiles', JSON.stringify(importedData.data));
            }
            if (importedData.stickyNotes) {
              if (typeof browser !== 'undefined' && browser.storage) {
                importPromises.push(browser.storage.local.set({ stickyNotes: importedData.stickyNotes }));
              }
              localStorage.setItem('stickyNotes', JSON.stringify(importedData.stickyNotes));
            }
            break;

          default:
            showCustomAlert('Unknown import file type');
            return;
        }

        Promise.all(importPromises).then(async () => {
          // If there are settings in the import file, mirror them into browser.storage.local
          try {
            let settingsObj = null;
            if (importedData.type === 'full' && importedData.settings) settingsObj = importedData.settings;
            if (importedData.type === 'settings' && importedData.data) settingsObj = importedData.data;

            if (settingsObj && typeof browser !== 'undefined' && browser.storage) {
              // Prepare a settings object with only primitive keys for browser.storage
              const toSet = {};
              const skippedKeys = [];
              const SIZE_LIMIT = 150 * 1024; // 150KB
              Object.entries(settingsObj).forEach(([k, v]) => {
                if (v === null || v === undefined) return;
                // Skip the customBackground as it's handled elsewhere
                if (k === 'customBackground') return;
                try {
                  const s = (typeof v === 'string') ? v : JSON.stringify(v);
                  if (s.length > SIZE_LIMIT) {
                    skippedKeys.push(k);
                    return;
                  }
                  toSet[k] = v;
                } catch (e) {
                  // If serialization fails, skip this key
                  skippedKeys.push(k);
                }
              });
              if (skippedKeys.length) console.warn('Skipping large import keys for browser.storage:', skippedKeys);
              if (Object.keys(toSet).length) {
                await browser.storage.local.set(toSet);
              }
            }
          } catch (err) {
            // Better error output (chrome runtime errors are often objects)
            try {
              const msg = err && err.message ? err.message : (typeof err === 'string' ? err : JSON.stringify(err));
              console.warn('Failed to persist import settings to browser.storage:', msg);
            } catch (e) {
              console.warn('Failed to persist import settings to browser.storage: (unserializable error)');
            }

            // Fallback: persist simple settings into localStorage where possible
            if (typeof settingsObj === 'undefined' || settingsObj === null) {
              // Attempt to rederive from importedData
              if (importedData.type === 'full' && importedData.settings) settingsObj = importedData.settings;
              if (importedData.type === 'settings' && importedData.data) settingsObj = importedData.data;
            }
            if (settingsObj) {
              try {
                Object.entries(settingsObj).forEach(([k, v]) => {
                  // Skip customBackground here (handled separately) and skip complex objects
                  if (k === 'customBackground') return;
                  if (v === null || v === undefined) return;
                  try {
                    if (typeof v === 'object') {
                      localStorage.setItem(k, JSON.stringify(v));
                    } else {
                      localStorage.setItem(k, String(v));
                    }
                  } catch (e2) {
                    console.warn('Failed to persist import setting to localStorage for key', k, e2 && e2.message ? e2.message : e2);
                  }
                });
              } catch (e3) {
                console.error('Fallback persistence to localStorage failed:', e3 && e3.message ? e3.message : e3);
              }
            }
          }

          showCustomAlert('Import successful! Page will reload...');
          // Clear the import input so the same file can be reselected if needed
          try { importInput.value = ''; } catch (e) { }
          setTimeout(() => location.reload(), 1500);
        }).catch(error => {
          console.error('Import error:', error);
          showCustomAlert('Import completed with some errors');
          try { importInput.value = ''; } catch (e) { }
          setTimeout(() => location.reload(), 1500);
        });
      });
    } catch (error) {
      showCustomAlert('Error parsing import file: ' + error.message);
      console.error('Import error:', error);
    }
  };
  reader.readAsText(file);
});

/* ---------- HELPER FUNCTION ---------- */
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Safely persist a potentially-large custom background dataURL.
// Strategy:
// 1) If browser.storage.local exists, attempt to save there.
// 2) If that fails (quota) or not available, avoid writing huge data URLs to localStorage.
//    If the dataURL is reasonably small (<150KB), attempt localStorage; otherwise fall back to sessionStorage.
// 3) Return a Promise so callers can await completion.
function persistCustomBackground(bgDataUrl) {
  return new Promise(async (resolve) => {
    if (!bgDataUrl) return resolve();
    // Try browser.storage.local first
    if (typeof browser !== 'undefined' && browser.storage) {
      try {
        // If the image is large, attempt to resize before saving to reduce chance of quota error
        const SIZE_LIMIT = 150 * 1024; // 150KB
        let toSave = bgDataUrl;
        try {
          if (bgDataUrl.length >= SIZE_LIMIT) {
            toSave = await resizeImageDataUrl(bgDataUrl, 1920, 1080, 0.8);
          }
        } catch (e) {
          console.warn('Resize before storage failed:', e);
        }

        await browser.storage.local.set({ customBackground: toSave });
        // Set a small marker for legacy paths
        try { localStorage.setItem('hasCustomBackground', 'true'); } catch (e) { }
        return resolve();
      } catch (err) {
        console.warn('Failed to save customBackground to browser.storage:', err);
        // fallthrough to other options
      }
    }

    // Avoid writing huge strings to localStorage; use a conservative threshold
    try {
      const approxSize = bgDataUrl.length;
      const SIZE_LIMIT = 150 * 1024; // 150KB
      let toStore = bgDataUrl;
      if (approxSize >= SIZE_LIMIT) {
        // Attempt to resize to reduce size
        try {
          toStore = await resizeImageDataUrl(bgDataUrl, 1920, 1080, 0.8);
        } catch (e) {
          console.warn('Resize attempt failed:', e);
        }
      }

      if (toStore.length < SIZE_LIMIT) {
        try {
          localStorage.setItem('customBackground', toStore);
          return resolve();
        } catch (e) {
          console.warn('localStorage.setItem failed for customBackground:', e);
          // fallthrough
        }
      }
    } catch (e) {
      // ignore
    }

    // Last resort: keep in session only and inform user
    try {
      sessionStorage.setItem('sessionCustomBackground', bgDataUrl);
    } catch (e) {
      console.error('Unable to store session custom background:', e);
    }
    showCustomAlert('Imported background is too large to persist. It will be used for this session only.');
    resolve();
  });
}

/* ---------- CONTEXT MENUS ---------- */
const ctxMenu = document.createElement('div');
ctxMenu.className = 'context-menu';
ctxMenu.innerHTML = `
<button id="ctxEdit">✎ Edit</button>
<button id="ctxDelete">🗑 Delete</button>`;
document.body.appendChild(ctxMenu);

let ctxIndex = null;

container.addEventListener('contextmenu', e => {
  const tile = e.target.closest('.tile');
  if (!tile || tile.classList.contains('add-tile')) {
    hideAllContextMenus();
    return;
  }
  e.preventDefault();
  hideAllContextMenus();
  ctxIndex = +tile.dataset.index;

  if (tile.dataset.type === 'folder') {
    showFolderContextMenu(e, links[ctxIndex], ctxIndex);
  } else {
    // Set the innerHTML for regular tile context menu
    ctxMenu.innerHTML = `
        <button id="ctxEdit">✎ Edit</button>
        <button id="ctxDelete">🗑 Delete</button>`;
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.display = 'block';

    // Attach event listeners immediately after creating the buttons
    document.getElementById('ctxEdit').addEventListener('click', () => {
      if (ctxIndex !== null) {
        window.editSite(ctxIndex);
      }
      hideAllContextMenus();
    });

    document.getElementById('ctxDelete').addEventListener('click', () => {
      if (ctxIndex !== null) {
        window.deleteSite(ctxIndex);
      }
      hideAllContextMenus();
    });
  }
});

document.body.addEventListener('contextmenu', e => {
  const clickedOnTileOrAdd = e.target.closest('.tile') || e.target.closest('.add-tile');
  const clickedOnContextMenu = e.target.closest('.context-menu');
  const clickedOnModal = e.target.closest('.modal') || e.target.closest('.folder-bubble'); // Include folder-bubble here
  const clickedOnClock = e.target.closest('#new-digital-clock');

  if (!clickedOnTileOrAdd && !clickedOnContextMenu && !clickedOnModal && !clickedOnClock) {
    e.preventDefault();
    hideAllContextMenus();
    showEditButtonAt(e.clientX, e.clientY);
  } else {
    hideEditButton();
  }
});

document.addEventListener('click', e => {
  // Also include the new reset modal in the check
  if (!e.target.closest('.context-menu') && !e.target.closest('.modal') && !e.target.closest('.folder-bubble')) {
    hideAllContextMenus();
  }
});

editBtn.addEventListener('click', openEditModal);

// Search form and related listeners removed (search bar removed from HTML)

// Event listeners for ctxEdit and ctxDelete are now inside the contextmenu handler
// to properly handle regular tiles vs folders.
document.getElementById('ctxEdit').addEventListener('click', () => {
  if (ctxIndex !== null) {
    window.editSite(ctxIndex);
  }
  hideAllContextMenus();
});

document.getElementById('ctxDelete').addEventListener('click', () => {
  if (ctxIndex !== null) {
    window.deleteSite(ctxIndex);
  }
  hideAllContextMenus();
});

// Listen for messages from the popup
if (typeof browser !== 'undefined' && browser.runtime) {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'tileAdded') {
      // Refresh the tiles by getting them from storage
      if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.local.get('tiles').then(result => {
          if (result.tiles) {
            links = result.tiles;
            renderTiles();
          }
        });
      } else {
        links = JSON.parse(localStorage.getItem("tiles") || "[]");
        renderTiles();
      }
      sendResponse({ success: true });
    }
  });
}

/* ---------- INITIALIZATION ---------- */
window.onload = function () {
  // Removed searchInput.focus();
  setupSoundSlider(); // Call setupSoundSlider function
  renderTiles(); // Initial rendering of tiles
  showWelcomeModal(); // Call the welcome modal function
};


// Opens the browser's extensions/addons page to let users pin the extension.
function openExtensionsPage() {
  try {
    // Chrome: attempt to open extensions page for this extension
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
      return;
    }
  } catch (e) { /* ignore */ }

  try {
    // Firefox/WebExtensions: open the add-ons manager
    if (typeof browser !== 'undefined' && browser.tabs) {
      browser.tabs.create({ url: 'about:addons' });
      return;
    }
  } catch (e) { /* ignore */ }

  // Fallback: open a help page bundled in the extension (if exists)
  try {
    const url = (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL)
      ? browser.runtime.getURL('pin-instructions.html')
      : (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('pin-instructions.html')
        : 'about:blank';
    window.open(url, '_blank');
  } catch (e) { console.warn('Unable to open extensions page:', e); }
}

function showPinModal() {
  // Only show once unless user clears storage
  try {
    const seen = localStorage.getItem('hasSeenPinInstructions');
    if (seen) return; // already shown

    const pinModal = document.getElementById('pinModal');
    if (!pinModal) return;

    pinModal.style.display = 'flex';
    document.body.classList.add('modal-open');

    const openBtn = document.getElementById('openExtensionsBtn');
    const gotItBtn = document.getElementById('pinModalGotItBtn');

    if (openBtn) openBtn.onclick = (ev) => {
      ev.preventDefault();
      openExtensionsPage();
    };

    if (gotItBtn) gotItBtn.onclick = (ev) => {
      ev.preventDefault();
      pinModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      localStorage.setItem('hasSeenPinInstructions', 'true');
    };
  } catch (e) {
    console.warn('showPinModal error', e);
  }
}

/* ---------- FIRST-TIME USER WELCOME MODAL ---------- */
function showWelcomeModal() {
  const welcomeModal = document.getElementById('welcomeModal');
  const welcomeConfirmBtn = document.getElementById('welcomeConfirmBtn');

  // Check if the user has seen the welcome modal before
  const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');

  if (!hasSeenWelcome) {
    welcomeModal.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Disable button initially and start countdown
    welcomeConfirmBtn.disabled = true;
    welcomeConfirmBtn.style.opacity = '0.5';
    welcomeConfirmBtn.style.cursor = 'not-allowed';

    let timeLeft = 5;
    const originalText = welcomeConfirmBtn.textContent;
    welcomeConfirmBtn.textContent = `${originalText} (${timeLeft}s)`;

    const timer = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        welcomeConfirmBtn.textContent = `${originalText} (${timeLeft}s)`;
      } else {
        clearInterval(timer);
        welcomeConfirmBtn.textContent = originalText;
        welcomeConfirmBtn.disabled = false;
        welcomeConfirmBtn.style.opacity = '1';
        welcomeConfirmBtn.style.cursor = 'pointer';
      }
    }, 1000);

    welcomeConfirmBtn.addEventListener('click', () => {
      if (welcomeConfirmBtn.disabled) return;
      welcomeModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      localStorage.setItem('hasSeenWelcome', 'true'); // Mark as seen
      // After the welcome modal is dismissed, show the pin instructions modal
      try { showPinModal(); } catch (e) { /* ignore if function/modal missing */ }
    });
  }
}

// Collapsible settings logic
document.addEventListener('DOMContentLoaded', () => {
  function setupCollapsible(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;

    const content = group.querySelector('.collapsible-content');
    if (!content) return;

    // Ensure the element starts closed
    if (!group.classList.contains('open')) {
      content.style.maxHeight = '0px';
      content.style.opacity = '0';
      content.style.paddingTop = '0px';
    }

    function toggleSettings(forceOpen) {
      const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !group.classList.contains('open');
      if (shouldOpen) {
        group.classList.add('open');
        content.style.maxHeight = content.scrollHeight + 24 + 'px';
        content.style.opacity = '1';
        content.style.paddingTop = '10px';
      } else {
        group.classList.remove('open');
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.paddingTop = '0px';
      }
    }

    // Click handler
    group.addEventListener('click', (ev) => {
      const interactiveTags = ['INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'BUTTON'];
      let node = ev.target;
      while (node && node !== group) {
        if (interactiveTags.includes(node.tagName)) return;
        node = node.parentElement;
      }
      toggleSettings();
    });

    // Keyboard accessibility
    const header = group.querySelector('.collapsible-header');
    if (header) {
      header.setAttribute('tabindex', '0');
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSettings();
        }
      });
    }

    // Keep open when focusing inputs
    content.querySelectorAll('input,select,textarea').forEach(el => {
      el.addEventListener('focus', () => toggleSettings(true));
    });
  }

  setupCollapsible('clockSettingsGroup');
});

// Add these variables at the top with other modal variables
document.addEventListener('DOMContentLoaded', () => {
  const contactBtn = document.getElementById('contactBtn');
  const contactModal = document.getElementById('contactModal');
  const copyEmailBtn = document.getElementById('copyEmailBtn');
  const closeContactModalBtn = document.getElementById('closeContactModalBtn');
  const contactEmail = document.getElementById('contactEmail');

  // Replace 'example@example.com' with your actual email
  const yourEmail = 'cagantshomepage@gmail.com';
  if (contactEmail) {
    contactEmail.textContent = yourEmail;
  }

  // Add these event listeners with the others
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      closeEditModal();
      if (contactModal) {
        contactModal.style.display = 'flex';
        document.body.classList.add('modal-open');
      }
    });
  }

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(yourEmail).then(() => {
        showCustomAlert('Email copied to clipboard!');
        if (contactModal) {
          contactModal.style.display = 'none';
          document.body.classList.remove('modal-open');
        }
      }).catch(err => {
        showCustomAlert('Failed to copy email: ' + err);
      });
    });
  }

  if (closeContactModalBtn) {
    closeContactModalBtn.addEventListener('click', () => {
      if (contactModal) {
        contactModal.style.display = 'none';
        document.body.classList.remove('modal-open');
      }
    });
  }

  const mailBtn = document.getElementById('mailBtn');
  if (mailBtn) {
    mailBtn.addEventListener('click', () => {
      window.location.href = 'mailto:cagantshomepage@gmail.com';
    });
  }
});

/* ---------- STICKY NOTES LOGIC ---------- */
const stickyNoteSettingsModal = document.getElementById('stickyNoteSettingsModal');
const saveStickyNoteSettingsBtn = document.getElementById('saveStickyNoteSettingsBtn');
const cancelStickyNoteSettingsBtn = document.getElementById('cancelStickyNoteSettingsBtn');
const addStickyNoteCtxBtn = document.getElementById('addStickyNoteCtxBtn');
const notePaperColorInput = document.getElementById('notePaperColorInput');
const noteTextColorInput = document.getElementById('noteTextColorInput');
const noteFontSizeDropdown = document.getElementById('noteFontSizeDropdown');
const noteFontSizeSelect = document.getElementById('noteFontSizeSelect');
const noteFontFamilyDropdown = document.getElementById('noteFontFamilyDropdown');
const noteFontFamilySelect = document.getElementById('noteFontFamilySelect');

let currentEditingNoteId = null;
// Track last right-click position so new sticky notes appear at cursor
let lastContextMenuPos = { x: 100, y: 100 };

// record latest contextmenu coordinates (used by Add Sticky Note)
document.addEventListener('contextmenu', (e) => {
  lastContextMenuPos = { x: e.clientX, y: e.clientY };
}, { passive: true });

function saveStickyNotes() {
  localStorage.setItem('stickyNotes', JSON.stringify(stickyNotes));
  if (typeof browser !== 'undefined' && browser.storage) {
    browser.storage.local.set({ stickyNotes: stickyNotes });
  }
}

function renderStickyNotes() {
  // Remove existing notes from DOM
  document.querySelectorAll('.sticky-note').forEach(el => el.remove());

  stickyNotes.forEach(note => {
    const noteEl = document.createElement('div');
    noteEl.className = 'sticky-note';
    noteEl.id = `note-${note.id}`;
    noteEl.style.left = note.x + 'px';
    noteEl.style.top = note.y + 'px';
    // restore saved size if present
    if (note.width) noteEl.style.width = note.width + 'px';
    if (note.height) noteEl.style.height = note.height + 'px';
    noteEl.style.backgroundColor = note.paperColor || '#fff740';
    noteEl.style.zIndex = note.zIndex || 1000;

    const header = document.createElement('div');
    header.className = 'sticky-note-header';

    // Title
    const titleEl = document.createElement('span');
    titleEl.className = 'sticky-note-title';
    titleEl.textContent = note.title || 'Note';
    titleEl.contentEditable = true;
    titleEl.spellcheck = false;

    titleEl.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Prevent drag
    });
    titleEl.addEventListener('input', () => {
      note.title = titleEl.textContent;
      saveStickyNotes();
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      }
    });

    const controls = document.createElement('div');
    controls.className = 'sticky-note-controls';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'sticky-note-btn';
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Settings';
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent drag start
      openStickyNoteSettings(note.id);
    });

    const anchorBtn = document.createElement('button');
    anchorBtn.className = 'sticky-note-btn anchor-btn';
    anchorBtn.innerHTML = note.isAnchored ? '⚓' : '🔓';
    anchorBtn.title = note.isAnchored ? 'Unanchor' : 'Anchor';
    anchorBtn.style.color = note.isAnchored ? '#000' : '';
    anchorBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      note.isAnchored = !note.isAnchored;
      anchorBtn.innerHTML = note.isAnchored ? '⚓' : '🔓';
      anchorBtn.title = note.isAnchored ? 'Unanchor' : 'Anchor';
      anchorBtn.style.color = note.isAnchored ? '#000' : '';
      saveStickyNotes();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sticky-note-btn delete-btn';
    deleteBtn.innerHTML = '🗑';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteStickyNote(note.id);
    });

    controls.appendChild(anchorBtn);
    controls.appendChild(settingsBtn);
    controls.appendChild(deleteBtn);

    header.appendChild(titleEl);
    header.appendChild(controls);

    const content = document.createElement('div');
    content.className = 'sticky-note-content';
    content.contentEditable = true;
    content.innerHTML = note.content || '';
    content.style.color = note.textColor || '#000000';
    content.style.fontSize = (note.fontSize || 16) + 'px';
    content.style.fontFamily = note.fontFamily || "'Roboto', sans-serif";

    content.addEventListener('input', (e) => {
      note.content = content.innerHTML;
      saveStickyNotes();
    });

    // Custom Context Menu
    content.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showFormattingMenu(e.clientX, e.clientY, content);
    });

    // Checklist click handler
    content.addEventListener('click', (e) => {
      if (e.target.tagName === 'LI' && e.target.closest('ul.checklist')) {
        const rect = e.target.getBoundingClientRect();
        // Check if click is in the left 24px (where the checkbox is)
        if (e.clientX >= rect.left && e.clientX <= rect.left + 24) {
          e.target.classList.toggle('checked');
          note.content = content.innerHTML;
          saveStickyNotes();
        }
      }
    });

    // Handle Enter key in checklists to prevent inheriting 'checked' state
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const li = node.nodeType === 1 ? node.closest('li') : node.parentElement.closest('li');

        // Only act if we are inside a checklist item
        if (li && li.closest('ul.checklist')) {
          e.preventDefault(); // Stop default browser behavior

          // Create a new, unchecked list item
          const newLi = document.createElement('li');
          // Add a zero-width space to make the new element selectable and editable
          newLi.innerHTML = '&#8203;';

          // Insert the new li after the current one
          if (li.nextSibling) {
            li.parentNode.insertBefore(newLi, li.nextSibling);
          } else {
            li.parentNode.appendChild(newLi);
          }

          // Move cursor to the new li
          const newRange = document.createRange();
          newRange.setStart(newLi, 1); // Position cursor after the zero-width space
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);

          // Manually trigger save
          note.content = content.innerHTML;
          saveStickyNotes();
        }
      }
    });

    // Create four corner resizers (tl, tr, bl, br)
    const corners = ['tl', 'tr', 'bl', 'br'];
    const maxCap = 500; // smaller max size
    const minW = 120;
    const minH = 80;

    corners.forEach(corner => {
      const r = document.createElement('div');
      r.className = 'sticky-note-resizer resizer-' + corner;
      r.dataset.corner = corner;
      r.title = 'Resize';
      r.style.position = 'absolute';
      r.style.width = '18px';
      r.style.height = '18px';
      r.style.zIndex = 2000;
      r.style.background = 'transparent';
      // cursor per corner
      if (corner === 'tl' || corner === 'br') r.style.cursor = 'nwse-resize';
      else r.style.cursor = 'nesw-resize';

      let isResizingCorner = false;
      r.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (note.isAnchored) return;
        isResizingCorner = true;
        noteEl.classList.add('resizing');

        const startX = ev.clientX;
        const startY = ev.clientY;
        const startW = noteEl.offsetWidth;
        const startH = noteEl.offsetHeight;
        const startLeft = parseInt(noteEl.style.left || 0);
        const startTop = parseInt(noteEl.style.top || 0);

        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        function onMouseMove(me) {
          if (!isResizingCorner) return;
          const dx = me.clientX - startX;
          const dy = me.clientY - startY;
          let newW = startW;
          let newH = startH;
          let newLeft = startLeft;
          let newTop = startTop;

          if (corner === 'br') {
            newW = clamp(startW + dx, minW, Math.min(maxCap, window.innerWidth - startLeft - 8));
            newH = clamp(startH + dy, minH, Math.min(maxCap, window.innerHeight - startTop - 8));
          } else if (corner === 'bl') {
            let desiredWidth = startW - dx;
            desiredWidth = clamp(desiredWidth, minW, maxCap);
            newW = desiredWidth;
            newLeft = startLeft + (startW - newW);
            newLeft = clamp(newLeft, 8, window.innerWidth - newW - 8);
            newH = clamp(startH + dy, minH, Math.min(maxCap, window.innerHeight - startTop - 8));
          } else if (corner === 'tr') {
            let desiredHeight = startH - dy;
            desiredHeight = clamp(desiredHeight, minH, maxCap);
            newH = desiredHeight;
            newTop = startTop + (startH - newH);
            newTop = clamp(newTop, 8, window.innerHeight - newH - 8);
            newW = clamp(startW + dx, minW, Math.min(maxCap, window.innerWidth - startLeft - 8));
          } else if (corner === 'tl') {
            let desiredWidth = startW - dx;
            desiredWidth = clamp(desiredWidth, minW, maxCap);
            newW = desiredWidth;
            newLeft = startLeft + (startW - newW);
            newLeft = clamp(newLeft, 8, window.innerWidth - newW - 8);

            let desiredHeight = startH - dy;
            desiredHeight = clamp(desiredHeight, minH, maxCap);
            newH = desiredHeight;
            newTop = startTop + (startH - newH);
            newTop = clamp(newTop, 8, window.innerHeight - newH - 8);
          }

          noteEl.style.width = newW + 'px';
          noteEl.style.height = newH + 'px';
          noteEl.style.left = newLeft + 'px';
          noteEl.style.top = newTop + 'px';
          note.width = newW;
          note.height = newH;
          note.x = newLeft;
          note.y = newTop;
        }

        function onMouseUp() {
          if (!isResizingCorner) return;
          isResizingCorner = false;
          noteEl.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          saveStickyNotes();
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      noteEl.appendChild(r);
    });
    noteEl.appendChild(header);
    noteEl.appendChild(content);
    document.body.appendChild(noteEl);

    // Drag Logic
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.sticky-note-btn')) return; // Don't drag if clicking buttons
      if (e.target.closest('.sticky-note-title')) return; // Don't drag if clicking title
      if (note.isAnchored) return; // Don't drag if anchored

      e.preventDefault();
      let isDraggingNote = true;
      noteEl.classList.add('dragging');

      // Bring to front
      const maxZ = Math.max(...Array.from(document.querySelectorAll('.sticky-note')).map(n => parseInt(n.style.zIndex || 1000)), 1000);
      noteEl.style.zIndex = maxZ + 1;
      note.zIndex = maxZ + 1;

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseInt(noteEl.style.left || 0);
      const startTop = parseInt(noteEl.style.top || 0);

      function onMouseMove(ev) {
        if (!isDraggingNote) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Boundary checks
        const maxX = window.innerWidth - noteEl.offsetWidth;
        const maxY = window.innerHeight - noteEl.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));

        noteEl.style.left = newLeft + 'px';
        noteEl.style.top = newTop + 'px';

        note.x = newLeft;
        note.y = newTop;
      }

      function onMouseUp() {
        isDraggingNote = false;
        noteEl.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveStickyNotes();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

/* ---------- FORMATTING MENU ---------- */
let activeFormattingMenu = null;

function showFormattingMenu(x, y, targetElement) {
  hideFormattingMenu();

  const menu = document.createElement('div');
  menu.className = 'formatting-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const actions = [
    { label: 'Bold', icon: '<b>B</b>', cmd: 'bold' },
    { label: 'Italic', icon: '<i>I</i>', cmd: 'italic' },
    { separator: true },
    { label: 'Header', icon: 'H', cmd: 'formatBlock', value: 'H2' },
    { label: 'List', icon: '•', cmd: 'insertUnorderedList' },
    { label: 'Numbered List', icon: '1.', cmd: 'insertOrderedList' },
    { label: 'Checklist', icon: '☑', cmd: 'checklist' }
  ];

  actions.forEach(action => {
    if (action.separator) {
      const sep = document.createElement('div');
      sep.className = 'formatting-menu-separator';
      menu.appendChild(sep);
      return;
    }

    const btn = document.createElement('button');
    btn.innerHTML = `<span style="width: 20px; text-align: center;">${action.icon}</span> ${action.label}`;

    // Check active state
    let isActive = false;

    // Helper to check if current selection is inside a checklist
    const isInsideChecklist = () => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const node = selection.anchorNode;
        const ul = node.nodeType === 1 ? node.closest('ul.checklist') : (node.parentElement ? node.parentElement.closest('ul.checklist') : null);
        return !!ul;
      }
      return false;
    };

    if (action.cmd === 'checklist') {
      isActive = isInsideChecklist();
    } else if (action.cmd === 'insertUnorderedList') {
      // Only active if it's a list BUT NOT a checklist
      isActive = document.queryCommandState('insertUnorderedList') && !isInsideChecklist();
    } else if (action.cmd === 'formatBlock') {
      isActive = document.queryCommandValue('formatBlock').toLowerCase() === action.value.toLowerCase();
    } else {
      isActive = document.queryCommandState(action.cmd);
    }

    if (isActive) btn.classList.add('active');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      execFormat(action.cmd, action.value, targetElement);
      hideFormattingMenu();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  activeFormattingMenu = menu;

  // Adjust position if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
}

function hideFormattingMenu() {
  if (activeFormattingMenu) {
    activeFormattingMenu.remove();
    activeFormattingMenu = null;
  }
}

function execFormat(cmd, value, targetElement) {
  targetElement.focus();
  if (cmd === 'checklist') {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const node = selection.anchorNode;
    const existingUl = node.nodeType === 1 ? node.closest('ul') : (node.parentElement ? node.parentElement.closest('ul') : null);

    if (existingUl) {
      if (existingUl.classList.contains('checklist')) {
        // Already a checklist. Toggle off -> remove list structure entirely (standard behavior)
        document.execCommand('insertUnorderedList');
      } else {
        // Normal list -> convert to checklist
        existingUl.classList.add('checklist');
      }
    } else {
      // Not a list -> create checklist
      document.execCommand('insertUnorderedList');
      // Find the new list and add class
      const newSelection = window.getSelection();
      if (newSelection.rangeCount > 0) {
        const newNode = newSelection.anchorNode;
        const newUl = newNode.nodeType === 1 ? newNode.closest('ul') : (newNode.parentElement ? newNode.parentElement.closest('ul') : null);
        if (newUl) newUl.classList.add('checklist');
      }
    }
  } else if (cmd === 'formatBlock') {
    const current = document.queryCommandValue('formatBlock');
    if (current.toLowerCase() === value.toLowerCase()) {
      document.execCommand('formatBlock', false, 'div');
    } else {
      document.execCommand('formatBlock', false, value);
    }
  } else {
    document.execCommand(cmd, false, value);
  }
}

// Close formatting menu on click elsewhere
document.addEventListener('click', (e) => {
  if (activeFormattingMenu && !activeFormattingMenu.contains(e.target)) {
    hideFormattingMenu();
  }
});

function addStickyNote() {
  if (stickyNotes.length >= 15) {
    showCustomAlert('You can only create up to 15 sticky notes.');
    return;
  }

  // Place initial note near last context-menu (cursor) position, with small offset
  // Default size is a perfect square
  const defaultSize = 220;
  let startX = lastContextMenuPos.x + 8;
  let startY = lastContextMenuPos.y + 8;
  // Keep inside viewport
  startX = Math.max(8, Math.min(startX, window.innerWidth - defaultSize - 8));
  startY = Math.max(8, Math.min(startY, window.innerHeight - defaultSize - 8));

  // Soft Lavender first, then Buttercream Yellow, Sage Mist, Pale Periwinkle, Dusty Rose
  const defaultColors = ['#EDE0F5', '#FFF4BD', '#D4EAC8', '#D6EAF8', '#FADBD8'];

  let nextColor = defaultColors[0];
  if (stickyNotes.length > 0) {
    const lastColor = stickyNotes[stickyNotes.length - 1].paperColor;
    const lastIndex = defaultColors.indexOf(lastColor);
    if (lastIndex !== -1) {
      nextColor = defaultColors[(lastIndex + 1) % defaultColors.length];
    }
  }

  const newNote = {
    id: Date.now(),
    x: startX,
    y: startY,
    width: defaultSize,
    height: defaultSize,
    content: '',
    title: 'Note',
    paperColor: nextColor,
    textColor: '#000000',
    fontSize: 16,
    fontFamily: "'Roboto', sans-serif",
    zIndex: 1000 + stickyNotes.length
  };

  stickyNotes.push(newNote);
  saveStickyNotes();
  renderStickyNotes();

  // Close the settings modal to show the new note
  closeEditModal();
  const editButtonContextMenu = document.getElementById('editButtonContextMenu');
  if (editButtonContextMenu) editButtonContextMenu.style.display = 'none';
}

function deleteStickyNote(id) {
  showCustomConfirm('Are you sure you want to delete this note?', () => {
    stickyNotes = stickyNotes.filter(n => n.id !== id);
    saveStickyNotes();
    renderStickyNotes();
  });
}

function openStickyNoteSettings(id) {
  currentEditingNoteId = id;
  const note = stickyNotes.find(n => n.id === id);
  if (!note) return;

  notePaperColorInput.value = note.paperColor || '#fff740';
  noteTextColorInput.value = note.textColor || '#000000';

  // Set font size dropdown
  const currentFontSize = note.fontSize || 16;
  if (noteFontSizeSelect) {
    noteFontSizeSelect.value = currentFontSize;
    const fontSizeLabel = noteFontSizeDropdown.querySelector('.current-font-label');
    if (fontSizeLabel) fontSizeLabel.textContent = currentFontSize + 'px';
  }

  // Set font family dropdown
  const currentFont = note.fontFamily || "'Roboto', sans-serif";
  noteFontFamilySelect.value = currentFont;
  const fontLabel = noteFontFamilyDropdown.querySelector('.current-font-label');
  const option = noteFontFamilyDropdown.querySelector(`.dropdown-option[data-value="${currentFont}"]`);
  if (fontLabel && option) {
    fontLabel.textContent = option.textContent;
    fontLabel.style.fontFamily = currentFont;
  }

  stickyNoteSettingsModal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

// Event Listeners for Sticky Note Settings
if (addStickyNoteCtxBtn) {
  addStickyNoteCtxBtn.addEventListener('click', addStickyNote);
}

if (saveStickyNoteSettingsBtn) {
  saveStickyNoteSettingsBtn.addEventListener('click', () => {
    if (currentEditingNoteId) {
      const note = stickyNotes.find(n => n.id === currentEditingNoteId);
      if (note) {
        note.paperColor = notePaperColorInput.value;
        note.textColor = noteTextColorInput.value;
        note.fontSize = parseInt(noteFontSizeSelect.value);
        note.fontFamily = noteFontFamilySelect.value;
        saveStickyNotes();
        renderStickyNotes();
      }
    }
    stickyNoteSettingsModal.style.display = 'none';
    document.body.classList.remove('modal-open');
    currentEditingNoteId = null;
  });
}

if (cancelStickyNoteSettingsBtn) {
  cancelStickyNoteSettingsBtn.addEventListener('click', () => {
    stickyNoteSettingsModal.style.display = 'none';
    document.body.classList.remove('modal-open');
    currentEditingNoteId = null;
  });
}


// Dropdown logic for sticky note font size
if (noteFontSizeDropdown) {
  const selected = noteFontSizeDropdown.querySelector('.dropdown-selected');
  const options = noteFontSizeDropdown.querySelector('.dropdown-options');
  const hiddenInput = document.getElementById('noteFontSizeSelect');
  const labelSpan = selected.querySelector('.current-font-label');

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      if (d !== noteFontSizeDropdown) d.classList.remove('open');
    });
    noteFontSizeDropdown.classList.toggle('open');
  });

  options.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      const text = opt.textContent;
      hiddenInput.value = val;
      labelSpan.textContent = text;
      noteFontSizeDropdown.classList.remove('open');
    });
  });
}

// Dropdown logic for sticky note font family
if (noteFontFamilyDropdown) {
  const selected = noteFontFamilyDropdown.querySelector('.dropdown-selected');
  const options = noteFontFamilyDropdown.querySelector('.dropdown-options');
  const hiddenInput = document.getElementById('noteFontFamilySelect');
  const labelSpan = selected.querySelector('.current-font-label');

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      if (d !== noteFontFamilyDropdown) d.classList.remove('open');
    });
    noteFontFamilyDropdown.classList.toggle('open');
  });

  options.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      const text = opt.textContent;
      hiddenInput.value = val;
      labelSpan.textContent = text;
      labelSpan.style.fontFamily = val;
      noteFontFamilyDropdown.classList.remove('open');
    });
  });
}

// Close sticky note settings modal on Escape
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (stickyNoteSettingsModal && stickyNoteSettingsModal.style.display === 'flex') {
      stickyNoteSettingsModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      currentEditingNoteId = null;
    }
  }
});

// Update the escape key handler to also close contact modal
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeEditModal();
    const resetConfirmModal = document.getElementById('resetConfirmModal');
    const exportConfirmModal = document.getElementById('exportConfirmModal');
    const contactModal = document.getElementById('contactModal');

    if (resetConfirmModal) resetConfirmModal.style.display = 'none';
    if (exportConfirmModal) exportConfirmModal.style.display = 'none'; // Also close export modal
    if (contactModal) contactModal.style.display = 'none';
    document.body.classList.remove('modal-open');
    closeFolder(); // Also close folder bubble
  }
});

/* ---------- THEME ICON UPDATE LOGIC ---------- */
function updateBrowserIcon(theme) {
  const isDark = theme === 'dark';
  const suffix = isDark ? 'white' : 'dark';
  const path = {
    16: `icons/icon16${suffix}.png`,
    32: `icons/icon32${suffix}.png`
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.action) {
      chrome.action.setIcon({ path });
    } else if (typeof browser !== 'undefined' && browser.browserAction) {
      browser.browserAction.setIcon({ path });
    } else if (typeof chrome !== 'undefined' && chrome.browserAction) {
      chrome.browserAction.setIcon({ path });
    }
  } catch (err) {
    console.warn('Could not set icon from main.js', err);
  }

  // Notify background script (for Chrome persistence)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'THEME_CHANGED', theme });
    }
  } catch (e) { }
}

if (window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleTheme = (e) => updateBrowserIcon(e.matches ? 'dark' : 'light');
  handleTheme(media);
  media.addEventListener('change', handleTheme);
}

