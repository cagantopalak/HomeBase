# Architecture

How the extension is put together, where each piece of state lives, and what the export
files contain. Written against the 7.3.0 tree.

## Three contexts

The extension runs in three places that share no memory. They talk over
`chrome.runtime.sendMessage` and over `chrome.storage.local`.

### newtab (`newtab.html`)

The page that replaces the new tab. It holds nearly all of the code, split across the files
below. Two scripts run as they are parsed and the rest are deferred, which means they run in
the order they are listed.

| Script | Loading | Why |
| --- | --- | --- |
| `js/effects/EffectManager.js` | parsed, in `<body>` after the canvas | its constructor reads `<canvas id="atmosphereCanvas">`, so the element must already exist |
| `js/mock-extension.js` | parsed | builds the `chrome.*` stand-in before anything reads storage |
| `js/browser-api.js` | parsed | wraps `chrome.*` as `browser.*`, same reason |
| `js/state.js` | deferred | the v3 shape and the migration off v2 |
| `js/store.js` | deferred | operations on a state |
| `js/persist.js` | deferred | loading and saving |
| `js/app.js` | deferred | the live state, colours, dialogs, sound |
| `js/wallpaper.js` | deferred | background image |
| `js/clock.js` | deferred | clock |
| `js/context-menu.js` | deferred | menus |
| `js/tiles.js` | deferred | grid, folders, drag and drop |
| `js/settings.js` | deferred | settings modal, export and import |
| `js/sync.js` | deferred | the local bridge, off by default |
| `js/sticky-notes.js` | deferred | notes |
| `changelog/updater.js` | deferred | independent of everything above |
| `js/main.js` | deferred | boot |

Each file wraps itself in an IIFE and hangs one object off `window`, and reads the ones it
depends on at that point, which is why the order matters.

`js/main.js` loads the state, hands it to the modules, and wires what belongs to the page
rather than to any one of them: the right click on empty space, one Escape handler, the
toolbar icon, and the listener for the popup.

### popup (`popup.html`, `js/popup.js`)

The toolbar button. Prefills a form from the active tab, lets the user pick or name a
folder, appends the tile through the same store and the same persistence path the newtab
page uses, then sends `{action: "tileAdded"}` so an open newtab reloads.

It loads `state.js`, `store.js` and `persist.js` for that reason. Before v3 it wrote the
`tiles` key in `chrome.storage.local` directly.

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

`js/browser-api.js` runs next and only when `browser` is undefined but `chrome` is present,
that is, in Chrome. It wraps the callback-style `chrome.storage.local`, `chrome.tabs` and
`chrome.runtime.sendMessage` in promises.

Consequence: the codebase always calls `browser.*`. In Firefox that resolves natively, in
Chrome through the promise wrapper, and under `file://` through the mock.

## State

Everything the page reads is one object.

```js
{
  version: 3,
  tiles: [ /* tiles and folders, in display order */ ],
  notes: [ /* sticky notes */ ],
  settings: { /* the 14 keys below */ }
}
```

`js/persist.js` writes it to **both** `chrome.storage.local` and `localStorage` under the
key `homebaseState`, on every change. The mirror is the point: before v3 the tiles were in
`chrome.storage.local` and every setting was in `localStorage` only, so clearing browsing
data dropped the settings and kept the tiles.

Two things stay outside the object.

**The background image**, under `customBackground`, because it is a data URL of up to a few
hundred KB and folding it in would rewrite it on every tile drag. It has its own ladder:
`chrome.storage.local`, then `localStorage` if it is under 150 KB, then `sessionStorage`
under `sessionCustomBackground`, and the user is told when it lands in the last one.

**Four flags** that were never exported and are not settings: `hasSeenWelcome`,
`hasSeenPinInstructions`, `hasCustomBackground` and `homebase_changelog_version`. They stay
in `localStorage`.

### Settings

All typed. Before v3 every one of them was a string, which is why the old code compared
`showClock` against `"false"` and `tileBorderWidth` against `"0px"`.

| Key | Type | Default | Note |
| --- | --- | --- | --- |
| `textColor` | string | `#FFFFFF` | tile label colour |
| `tileColor` | string | `rgba(255,255,255,0.4)` | an `rgba()` string |
| `fontFamily` | string | `'Roboto', sans-serif` | a full CSS font stack |
| `soundVolume` | number | `0.2` | -1 and below means muted |
| `tilePlacement` | string | `top` | `top` or `middle` |
| `tileBorderWidth` | number | `0` | pixels; `px` is added at render |
| `showClock` | boolean | `true` | |
| `clockColor` | string | `#FFFFFF` | |
| `clockFontFamily` | string | `'Climate Crisis', cursive` | |
| `clockFormat` | string | `24` | `12` or `24` |
| `showSeconds` | boolean | `false` | |
| `clockSize` | number | `64` | pixels |
| `clockPosition` | string | `left` | `left` or `right` |
| `atmosphereEffect` | string | `none` | see the effect list below |

Every default matches the value `style.css` already declares for the matching CSS variable,
so writing them out explicitly renders the same as leaving them unset did before.

### Migration

`state.js` builds v3 out of the pre-v3 keys the first time the page opens without one, and
`persist.js` writes it once. Precedence repeats what the old load path did:

- tiles: `chrome.storage.local`'s `tiles` when the array is non-empty, otherwise the
  `localStorage` copy;
- notes: `chrome.storage.local`'s `stickyNotes` whenever the key is present at all, even as
  an empty array, otherwise the `localStorage` copy;
- settings: `localStorage`, the only place they ever were.

**The pre-v3 keys are not deleted.** They are the way back to an older build for one
release. Nothing reads them again once v3 exists, so they are a snapshot as of the
migration, not a live mirror.

## What leaves the browser

Three requests, and only the first two exist by default.

**Tile favicons.** A tile with no `icon` falls back to
`https://www.google.com/s2/favicons?sz=64&domain_url=<hostname>`, so drawing the grid tells
Google the hostname of every such tile, on every render. The toolbar popup fills `icon` in
from the tab it was opened on, so tiles added that way do not make the request; tiles typed
in by hand do.

**The changelog check.** `changelog/updater.js` fetches
`https://homebase.birtik.co/changelog.json?t=<timestamp>` on every load, once
`hasSeenWelcome` and `hasSeenPinInstructions` are both set. It is not once per release: the
cache buster and the lack of any other gate mean one request per new tab. The reply is
compared against `homebase_changelog_version` in `localStorage` to decide whether to show
the modal.

**The sync bridge**, when it is switched on, to `127.0.0.1` only.

The published privacy policy at `homebase.birtik.co/privacy/` says data "is stored only on
your local device" with "no external transmission unless users enable optional features".
The sync bridge fits that sentence. The first two requests do not: neither is local, and
neither is optional. Nothing here changes that; it is recorded so the next person does not
have to rediscover it.

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
nest: the store refuses a folder moved into a folder, and dragging one out of a folder is
rejected with a message.

Tiles and folders share one array and identity is positional, so a tile is addressed by
**path**: `[i]` at the top level, `[folderIndex, i]` inside a folder. Before v3 those two
cases were two separate sets of drag handlers and a pair of module-level cursors.

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
written back into the DOM through `DOMParser` rather than `innerHTML`. Position is absolute
viewport pixels, so notes do not follow a window resize.

New notes cycle through five paper colours, appear at the last right-click position, and are
capped at 15 per page.

## The store

`js/store.js` is every operation the page performs, as functions that take a state and
return a new one. No DOM, no browser API, no persistence:

```
addTile      updateTile   replaceTile   removeTile   moveTile
createFolder moveIntoFolder renameFolder setFolderColor clearFolderColors
addNote      updateNote   removeNote
getSettings  setSettings  resetSettings
exportState  importState
```

`js/app.js` holds the one live state and a `commit` that replaces it, tells the modules to
redraw, and persists. `commit(next, {silent: true})` skips the redraw for a change the
caller has already drawn; a sticky note being typed into needs that, because rebuilding the
note would take the caret with it.

## Export and import

Three shapes, all tagged `version: 3` and distinguished by `type`.

```js
{ version: 3, type: "full",     tiles, notes, settings, customBackground? }
{ version: 3, type: "settings", settings, customBackground? }
{ version: 3, type: "links",    tiles, notes }
```

`importState` reads v2 files as well, and reports which sections a file actually carried, so
a settings-only backup cannot silently blank the tiles. v2 differs in three ways: it put a
links backup's tiles under `data` and a settings backup's settings under `data`, it always
called the notes `stickyNotes`, and it kept `customBackground` inside the settings block.

Import ends in `location.reload()`.

### The v2 export defect this replaced

`exportAllSettingsAndLinksBtn` used to call

```js
browser.storage.local.get(["tiles", "customBackground"])
```

and then read `result.stickyNotes`. That key was not requested, so the value was always
`undefined` and the export fell through to the `localStorage` copy of the notes. It produced
a correct file only because the old `saveStickyNotes()` wrote both stores on every change.

## Background effects

`js/effects/EffectManager.js` owns a full-viewport `<canvas id="atmosphereCanvas">` and one
`requestAnimationFrame` loop. `setEffect(name)` stops the running loop, clears the canvas and
starts the next one.

Six effects draw: `snow`, `rain` (with splashes), `leaves`, `fireflies`, `stars`, `sakura`.
`none` hides the canvas. Two names are dead ends kept for compatibility: `shootingstars` is
rewritten to `stars`, and `dust` is accepted but hides the canvas like `none`. Fog and
godrays were removed and the switch has no case for them.

The effect is applied at boot from `settings.atmosphereEffect`. Picking one in the settings
modal stores it straight away rather than waiting for Save, which is how it behaved before
v3 and is the one setting that works that way.

## Rendering

`tiles.js` rebuilds the whole grid on every change. There is no diffing: a rename, a reorder
or a drag past the hover threshold all cost a full rebuild. What changed with v3 is that the
rebuild is driven by a state change rather than called by hand from eighteen places, and it
no longer writes to storage as a side effect of drawing.

Drag and drop is hand-rolled on the HTML5 drag events, with the drop target's geometry read
per event to decide between two outcomes. The centre of a tile means "make a folder" or "add
to this folder"; the edge means "reorder". The dead zone differs by target: 25 percent from
each edge when the drop would create a folder, 10 percent when the target is already a
folder. Reordering waits on a dwell timer, 200 ms over a tile and 300 ms over a folder, so a
fast pass does not shuffle the grid.

Folder colour is applied twice over: once through the `--tile-bg-color` and
`--tile-border-color` CSS variables for the global case, and once as inline styles on the
tile, its four preview icons and the open bubble for a folder with `colorHex`. Inline styles
win, so a folder that drops its override needs them cleared, which is what the `paint()`
helper does when it is handed no colour.

## Sync

`js/sync.js` and `bridge/` put the state somewhere outside the browser. Both are optional
and the switch is off by default: while it is off, `sync.js` opens no socket, sends no
request and registers no listener, so the page behaves exactly as it does with no bridge in
the picture.

The bridge is a Node server on `http://127.0.0.1:8787` holding `~/.homebase/state.json` as
`{ rev, updatedAt, state }`, where `state` is the same v3 object the extension carries. It
validates with `js/state.js`, the extension's own file, so the two cannot drift.

When the switch is on, the page reads once at boot, writes on a 600 ms debounce after every
change, and follows `GET /events` so a second tab sees the first one's edits.

### Ordering

Every write bumps `rev`. A `PUT` carrying the `rev` it last saw is accepted. A `PUT`
carrying an older one is refused with `409` and the current record, because that writer has
not caught up; the page applies what it gets back. Last writer wins, except for a writer
that never saw what it would overwrite.

### Why not native messaging

Native messaging has the browser start the host process, while an MCP server is started by
whatever wants to use it. One process cannot serve two owners of its stdio, so it would take
a third daemon in between, plus a host manifest per browser and per operating system, a
pinned extension id, the install warning that comes with the `nativeMessaging` permission,
and a keepalive for the MV3 service worker.

### Why a loopback port needs guarding

Any page the user visits can send a request to `127.0.0.1`. CORS stops it reading the reply;
it does not stop the write happening. Three things together close that:

1. A token on every request. On anything that writes it must be the `X-HomeBase-Token`
   header, and a custom header forces a preflight, so the write cannot happen unless the
   preflight was answered first.
2. The preflight is answered only for an extension `Origin`, so a page is refused before its
   request is sent.
3. The socket is bound to `127.0.0.1`.

`GET /events` is the exception to the first: `EventSource` cannot set a header, so its token
rides in the query string. It only reads, and it still has to pass the origin check.

The sync switch, the token and the last-seen `rev` are stored under `homebaseSync`, outside
the state object. If they rode inside it, a machine with sync off would hand its `enabled:
false` to a machine with sync on, and the second would switch itself off.

Both manifests name `http://127.0.0.1:8787/*` as a permitted host and add it to
`connect-src`. Chrome MV3 wants the policy as an object under `extension_pages`; Firefox MV2
wants a plain string. The port is fixed rather than configurable because a manifest cannot
name a port the user picks later.

## MCP

`mcp/server.js` speaks MCP over stdio and hosts the bridge in the same process, so one
command gives both the tools and the endpoint the extension talks to. If a bridge is already
listening, it goes through that one over HTTP instead of opening a second, so the state file
has one writer.

stdout carries JSON-RPC and nothing else. The bridge's own logging is handed a writer that
goes to stderr, which is why `listen()` takes one.

The sixteen tools are thin wrappers over `js/store.js`: read the record, apply a store
function, write it back through the bridge, which broadcasts. The store being free of the
DOM is what makes that possible; before v3 every one of these operations only existed inside
a drag handler.

### What a tool is not allowed to write

The new tab page is the surface the user clicks most, and anything reaching these tools may
have come from text the model was asked to read.

- A tile's URL must be `http` or `https`. A tile is navigated to when it is clicked, so
  `javascript:`, `data:` and `file:` are all refused.
- An icon or a background may also be a `data:image/...` URL. Those are rendered as images
  and never navigated to, and an inline image is the form the extension already stores a
  chosen background in. `data:text/html` is refused.
- `homebase_import` replaces everything and cannot be undone, so it refuses unless it is
  called with `confirm: true`.
- `HOMEBASE_MCP_READONLY=1` makes every write tool refuse. They stay listed, with the reason
  in the description.

### The background over the bridge

`homebase_set_background` needs to reach a setting the extension keeps outside its state
object, so the bridge record carries `background` beside `state`. It travels inwards only: a
tool sets one and the page applies it, and the page never pushes its own, because it is a
data URL of up to a few hundred KB and every tile drag would carry it. A `PUT` that leaves
the field out keeps whatever is stored, which is what the extension's own writes do.

## Settings modal

Edits run against a draft copy of the settings. Every control previews live by applying the
draft, Save commits it through the store, and Cancel throws it away and reapplies what is
stored. Before v3 this was three `pending` variables, a parallel set of `saved` variables,
and a Cancel path that reread `localStorage` key by key and repeated itself twice in the
same function.

The dropdowns are not `<select>` elements: a div menu bound to a hidden input.
