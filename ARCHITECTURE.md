# Architecture

How the extension is put together, where each piece of state lives, and what the export
files contain. Written against the 7.3.0 tree.

## Three contexts

The extension runs in three places that share no memory. They talk over
`chrome.runtime.sendMessage` and over `chrome.storage.local`.

### newtab (`newtab.html`)

The page that replaces the new tab. It holds nearly all of the code. Scripts load in this
order:

| Script | Loading | Why |
| --- | --- | --- |
| `js/effects/EffectManager.js` | synchronous, in `<body>` after `<canvas id="atmosphereCanvas">` | its constructor reads the canvas, so it cannot be deferred, and the canvas must already be parsed |
| `js/mock-extension.js` | synchronous | must define the `chrome.*` stand-in before anything reads storage |
| `js/sticky-notes.js` | `defer` | declares `var stickyNotes`, which `main.js` fills |
| `changelog/updater.js` | `defer` | independent |
| `js/main.js` | `defer` | everything else |

`EffectManager.js` ends with `window.effectManager = new EffectManager()`, so the instance
exists by the time `main.js` runs.

`main.js` is not a module and defines no entry point. It is a flat script: top-level
statements run as the file is parsed, DOM elements are looked up into module-level `const`s,
and handlers are attached inline. `window.onload` then calls `setupSoundSlider()`,
`renderTiles()` and `showWelcomeModal()`.

### popup (`popup.html`, `js/popup.js`)

The toolbar button. Prefills a form from the active tab (`browser.tabs.query`), lets the
user pick or name a folder, appends the tile to the `tiles` array in `chrome.storage.local`,
then sends `{action: "tileAdded"}` so an open newtab reloads its tiles and re-renders.

The popup carries its own copy of the `browser` polyfill; it does not share `main.js`.

### background (`js/background.js`)

50 lines, one job: swap the toolbar icon between the light and dark icon set.

Firefox MV2 background pages have `window.matchMedia`, so the script watches
`(prefers-color-scheme: dark)` directly. A Chrome MV3 service worker has neither `window`
nor `matchMedia`, so there `main.js` watches the media query and posts
`{type: "THEME_CHANGED", theme}` to the background, which calls `setIcon`.

`chrome.action` is reached as `chrome["action"]` in both files. The bracket form is
deliberate: it keeps Firefox's static analysis from flagging an MV3-only API in a file that
ships in the MV2 build.

## The browser API shim

Two shims sit on top of each other, and they solve different problems.

`js/mock-extension.js` runs first and only when `chrome.runtime.id` is absent, that is,
outside an extension. It creates `window.chrome` from nothing: `runtime`, `storage.local`
over `localStorage` (with an in-memory object when `localStorage` throws under `file://`),
`tabs` and `contextMenus`. It also points `window.browser` at the same object.

The block at the top of `main.js` (and its twin at the top of `popup.js`) runs when
`browser` is undefined but `chrome` is present, that is, in Chrome. It wraps the
callback-style `chrome.storage.local`, `chrome.tabs` and `chrome.runtime.sendMessage` in
promises so the Firefox-flavoured `browser.*` calls in the rest of the file work unchanged.

Consequence: the codebase always calls `browser.*` and always guards with
`typeof browser !== "undefined" && browser.storage`. In Firefox that guard passes natively,
in Chrome through the promise wrapper, and under `file://` through the mock.

## Where state lives

State is split across two stores that are not kept in sync with each other. This is the
single largest piece of accidental complexity in the tree.

### `chrome.storage.local`

Three keys, and they survive a `localStorage` clear:

| Key | Shape |
| --- | --- |
| `tiles` | array of tile and folder objects |
| `stickyNotes` | array of note objects |
| `customBackground` | data URL string |

### `localStorage`

`tiles` and `stickyNotes` are mirrored here as a fallback. `saveStickyNotes()` writes both
stores on every call; `persist()` writes `chrome.storage.local` when it is available and
`localStorage` only when it is not, so the `localStorage` copy of `tiles` can be stale.

Everything else lives here and nowhere else. Eighteen keys, all stored as strings:

| Key | Default read in code | Note |
| --- | --- | --- |
| `textColor` | `#FFFFFF` | tile label colour |
| `tileColor` | `rgba(255,255,255,0.4)` | tile background, stored as an `rgba()` string |
| `fontFamily` | `'Roboto', sans-serif` | full CSS font stack |
| `soundVolume` | `0.5`, or `0.2` on the audio path | `-1` means muted; see below |
| `tilePlacement` | `top` | `top` or `middle` |
| `tileBorderWidth` | `0px` | a CSS length, not a number |
| `showClock` | `true` | compared as `!== "false"` |
| `clockColor` | `#FFFFFF` | |
| `clockFontFamily` | `'Climate Crisis', cursive` | |
| `clockFormat` | `24` | `12` or `24` |
| `showSeconds` | `false` | compared as `=== "true"` |
| `clockSize` | `64` | parsed with `parseInt`, rendered with `+ "px"` |
| `clockPosition` | `left` | `left` or `right` |
| `atmosphereEffect` | `none` | see the effect list below |
| `hasSeenWelcome` | unset | first-run flag |
| `hasSeenPinInstructions` | unset | first-run flag, gates the changelog check |
| `hasCustomBackground` | unset | marker written when a background reaches `chrome.storage.local` |
| `homebase_changelog_version` | unset | last changelog version the user dismissed |

Two of these are read inconsistently. `soundVolume` has one default of `0.5` at the top of
`main.js` and another of `0.2` on the audio-context path, and the slider treats any value
below zero as muted while storing the negative number verbatim. `tileBorderWidth` is a
string with a unit baked in, so it cannot be compared numerically and is instead matched
against the literal `"0px"` to decide the folder icon border.

Settings reach `chrome.storage.local` in exactly one direction and only by accident: on
import, every primitive settings key under 150 KB is mirrored there, and
`resetAllSettingsOnlyBtn` removes a hardcoded list of them again. Nothing ever reads them
back. Clearing browser data drops every setting while the tiles survive.

### `sessionStorage`

One key, `sessionCustomBackground`. Last resort when a background image fits neither
`chrome.storage.local` nor the 150 KB `localStorage` ceiling. `loadBackground()` reads it
between the extension store and the `localStorage` copy.

## Data model

### Tile

```js
{ name: "GitHub", url: "https://github.com", icon: "https://…/favicon.png" }
```

`icon` is optional. When absent the grid falls back to
`https://www.google.com/s2/favicons?sz=64&domain_url=<hostname>`, which means rendering a
tile makes a request to Google unless every tile carries an explicit icon.

### Folder

```js
{ type: "folder", name: "Work", links: [ /* tiles */ ], colorHex: "#3b82f6" }
```

A folder is a tile with `type: "folder"`; that field is the only discriminator. `colorHex`
is optional and, when absent, the folder follows the global tile colour. Folders do not
nest: the drag handlers refuse a folder dropped onto a folder, and the document-level drop
handler shows an alert for a folder dragged out of a folder.

Tiles and folders share one flat array, `links` in `main.js`, persisted as `tiles`.
Identity is positional. Every operation is an index into that array, and an open folder is
tracked as `activeFolder = { folder, index }`, which has to be re-derived with
`links.indexOf(...)` whenever an insertion shifts the array.

### Sticky note

```js
{
  id: 1737045000000,          // Date.now() at creation
  x: 108, y: 108,             // px from the viewport's top left
  width: 220, height: 220,    // px, clamped to 120x80 .. 500x500
  title: "Note",
  content: "<div>…</div>",    // innerHTML of the contenteditable
  paperColor: "#EDE0F5",
  textColor: "#000000",
  fontSize: 16,               // number, "px" added at render
  fontFamily: "'Roboto', sans-serif",
  zIndex: 1000,
  isAnchored: false           // anchored notes cannot be moved, resized or edited
}
```

`content` is raw HTML produced by `document.execCommand` on a `contenteditable`, and it is
written back into the DOM through `DOMParser` rather than `innerHTML`. Colours are stored
per note. Position is absolute viewport pixels, so notes do not follow a window resize.

New notes cycle through five paper colours based on the previous note's colour, appear at
the last right-click position, and are capped at 15 per page.

## Export and import

`main.js` writes three shapes, all tagged `version: 2` and distinguished by `type`. Import
switches on `type`, and rejects a file with no `type` or no `version`.

**`type: "full"`**, from `HomeBase_FullBackup.json`:

```js
{ version: 2, type: "full", tiles: [...], stickyNotes: [...], settings: { /* 15 keys */ } }
```

**`type: "settings"`**, from `HomeBase_Settings.json`. Note that the payload sits under
`data`, not `settings`:

```js
{ version: 2, type: "settings", data: { /* the same 15 keys */ } }
```

**`type: "links"`**, from `HomeBase_LinksAndNotes.json`. Here `data` is the tile array, and
notes sit beside it at the top level:

```js
{ version: 2, type: "links", data: [ /* tiles */ ], stickyNotes: [...] }
```

The settings block in all three carries fifteen keys: the fourteen visible settings above
plus `customBackground`. The four first-run and bookkeeping flags are not exported.

Import always ends in `location.reload()`, which is what makes the freshly written state
appear; nothing is applied to the running page beyond a preview of the background, the clock
size and position, and the atmosphere effect.

`customBackground` takes a separate path on both sides. On export it is read from
`chrome.storage.local` with a `localStorage` fallback; on import it goes through
`persistCustomBackground()`, which resizes anything over 150 KB to at most 1920x1080 JPEG at
quality 0.8, tries `chrome.storage.local`, then `localStorage`, then `sessionStorage`, and
warns the user when it lands in the last one.

### Known defect in the full export

`exportAllSettingsAndLinksBtn` calls

```js
browser.storage.local.get(["tiles", "customBackground"])
```

and then reads `result.stickyNotes`. That key was not requested, so the value is always
`undefined` and the export falls through to the `localStorage` copy of the notes. It
produces a correct file today only because `saveStickyNotes()` writes both stores on every
change.

## Background effects

`js/effects/EffectManager.js` owns a full-viewport `<canvas id="atmosphereCanvas">` and one
`requestAnimationFrame` loop. `setEffect(name)` stops the running loop, clears the canvas
and starts the next one.

Six effects draw: `snow`, `rain` (with splashes), `leaves`, `fireflies`, `stars`, `sakura`.
`none` hides the canvas. Two names are dead ends kept for compatibility: `shootingstars` is
rewritten to `stars`, and `dust` is accepted but hides the canvas like `none`. Fog and
godrays were removed and the switch has no case for them.

The selection lives in `localStorage.atmosphereEffect` and is applied at parse time in
`main.js`, before `DOMContentLoaded`, to avoid a race with the button wiring.

## Rendering

`renderTiles()` empties `#tilesContainer` and rebuilds every tile from scratch on every
change, then appends the add button and calls `persist(false)`. There is no diffing and no
virtual DOM: a rename, a reorder or a drag past the hover threshold all cost a full rebuild
of the grid.

Drag and drop is hand-rolled on the HTML5 drag events, with the drop target's geometry read
per event to decide between two outcomes. The centre of a tile means "make a folder" or "add
to this folder"; the edge means "reorder". The dead zone differs by target: 25 percent from
each edge when the drop would create a folder, 10 percent when the target is already a
folder. Reordering waits on a dwell timer, 200 ms over a tile and 300 ms over a folder, so a
fast pass does not shuffle the grid.

Drag state is nine module-level variables (`dragStartIndex`, `dragCurrentIndex`,
`isDragging`, `dragOverStartTime`, `folderWasMoved`, `reorderOccurred`,
`folderDragStartIndex`, `folderIsDragging`, `dragFromFolder`), reset across several
handlers.

Folder colour is applied twice over: once through the `--tile-bg-color` and
`--tile-border-color` CSS variables for the global case, and once as inline styles on the
tile, its four preview icons and the open bubble for a folder with `colorHex`. Because
inline styles win, a folder that drops its override needs those styles cleared by hand,
which is what `clearFolderInlineStylesForIndex()` and
`clearAllFolderInlineStylesIfNoOverride()` do.

## Settings modal

Most settings apply live as a preview and persist only on Save. Three of them go through
explicit pending variables, `pendingTilePlacement`, `pendingSoundVolume` and
`pendingShowClock`, which Save reads and Cancel discards before re-reading the stored value.
The rest of the previews write straight into module-level `saved*` variables, so Cancel has
to reload each one from `localStorage` by hand. `closeEditModal()` does that, and repeats
the volume and clock restoration twice in the same function.

The dropdowns are not `<select>` elements. `setupCustomDropdown()` binds a div-based menu to
a hidden input and `refreshCustomDropdown()` re-syncs the visible label when the modal
reopens.

## Duplication worth knowing about

Reading the tree, these are the places where the same thing exists more than once:

- `buildAddButton()` and `closeModal()` are each defined twice in `main.js`. The second
  definition wins, so the first is dead. The two `buildAddButton()` bodies differ: the dead
  one has no hover sound.
- The document-level `drop` handler that moves a tile out of a folder is registered twice
  with near-identical bodies. Both run. They differ in whether the emptied folder is removed
  before or after `closeFolder()`.
- Four `keydown` listeners each close some subset of the modals on Escape.
- The context menu markup is built three times: once as the shared `ctxMenu` at
  parse time, once inside `showContextMenu()`, and once inline in the container's
  `contextmenu` handler, which also re-attaches listeners to the freshly written buttons.
- The `browser` polyfill exists in `main.js` and again in `popup.js`.
