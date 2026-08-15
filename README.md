# HomeBase

A browser extension that replaces the new tab page with a grid of link tiles, folders and
sticky notes, over a background image you pick.

What it does:

- Link tiles with an icon and a label. Drag one tile onto another to make a folder.
- Folders with an optional per-folder colour, opened as an overlay bubble.
- Sticky notes with rich text, checklists, per-note colour, font and size. Limit of 15.
- A digital clock with configurable format, colour, font, size and position.
- Canvas background effects: snow, rain, leaves, fireflies, stars, sakura.
- Export and import of tiles, notes and settings as JSON.

Homepage: <https://homebase.birtik.co>

All of a user's data is stored in the browser. There is no account and nothing is uploaded.
Two requests do leave the browser, though, and they are listed below.

## What leaves the browser

| Request | When | Carries |
| --- | --- | --- |
| `https://www.google.com/s2/favicons?domain_url=<hostname>` | rendering a tile that has no explicit `icon` | the hostname of that tile |
| `https://homebase.birtik.co/changelog.json?t=<timestamp>` | every new tab, once the first-run modals have been dismissed | nothing beyond the request itself |

The favicon request is per tile and per render, so a grid of tiles added by hand tells Google
which sites are on it. Adding a tile from the toolbar popup fills in the icon from the tab,
which avoids the request for that tile.

The changelog request happens on every new tab rather than once per release. It has no body
and carries no identifier, but it does mean the page reaches the developer's server each
time it opens.

## Install from source

There is no build step. The repository is the extension.

**Chrome / Edge / Brave** (Manifest V3, uses `manifest.json`):

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose "Load unpacked" and select the repository folder.

**Firefox** (Manifest V2, uses `manifest-firefox.json`):

Firefox reads `manifest.json`, so swap the MV2 file in first. `manifest-chrome.json` is
already a copy of the Chrome manifest, so nothing is lost:

```sh
cp manifest-firefox.json manifest.json
```

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose "Load Temporary Add-on" and select `manifest.json`.

A temporary add-on is removed when Firefox closes. To go back to the Chrome build, copy
`manifest-chrome.json` over `manifest.json`.

## Run it without installing

`js/mock-extension.js` stands in for the `chrome.*` APIs when the page is opened outside an
extension. It detects the absence of `chrome.runtime.id` and mocks `chrome.storage.local`
on top of `localStorage`, falling back to an in-memory object when `localStorage` is blocked
under `file://`.

Open `newtab.html` in a browser. The page works, and data written this way is separate from
the data of an installed copy.

Two limits apply under `file://`:

- With the in-memory fallback, nothing survives a reload.
- The changelog check in `changelog/updater.js` fetches
  `https://homebase.birtik.co/changelog.json` and fails silently offline.

## Version numbers

Three files carry the version and are kept equal:

| File | Used by |
| --- | --- |
| `manifest.json` | Chrome, and Firefox after the swap above |
| `manifest-firefox.json` | Firefox source of truth |
| `changelog/changelog.json` | The changelog payload published to `homebase.birtik.co` |

`manifest-chrome.json` is a copy of the Chrome manifest kept so the swap is reversible, and
carries the same number.

The Firefox build sets the floor. AMO rejects an upload whose version is lower than one
already published, and the add-on is at 7.2.0 there, so the shared number moves forward from
that line rather than from the Chrome manifest's older `2.0`.

`changelog/changelog.json` in this repository is not what users read. The extension fetches
the copy published at `homebase.birtik.co/changelog.json`, which is at `2.0.0` and titled
"What's New on HomeBase 2.0". The repository copy had fallen behind at `1.0.6`. Publishing a
number the users have not seen is what makes the modal appear, so the published file needs
its body rewritten before it carries this version.

## Layout

```
manifest.json            Chrome MV3 manifest (the one browsers read)
manifest-chrome.json     Copy of the Chrome manifest
manifest-firefox.json    Firefox MV2 manifest
newtab.html              The new tab page
popup.html               The toolbar popup: add the current tab as a tile
style.css                Styles for both pages
js/main.js               Tiles, folders, settings, clock, export/import
js/sticky-notes.js       Sticky notes
js/popup.js              Popup logic
js/background.js         Background script: swaps the toolbar icon with the OS theme
js/mock-extension.js     chrome.* stand-in for running outside an extension
js/effects/              Canvas background effects
changelog/               Changelog fetch and modal
icons/                   Toolbar and store icons
```

`ARCHITECTURE.md` describes how these fit together, where each piece of state lives and what
the export files contain.
