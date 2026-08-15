# HomeBase over MCP

Sixteen tools for reading and changing the new tab page from an MCP client. Independent of
the extension: nobody who just wants HomeBase in their browser has to install this.

No dependencies and no build step.

## Setup

The server hosts the bridge from `bridge/`, so this one command gives you both the tools and
the endpoint the extension talks to.

```sh
claude mcp add homebase -- node /absolute/path/to/HomeBase/mcp/server.js
```

Read-only, which is the safer place to start:

```sh
claude mcp add homebase -e HOMEBASE_MCP_READONLY=1 -- node /absolute/path/to/HomeBase/mcp/server.js
```

Then, in the extension, turn sync on so the browser follows what the tools do:

1. Start the server once and read the token it prints, or take it from
   `~/.homebase/config.json`.
2. New tab, right click the background, Settings, Sync.
3. Tick the checkbox, paste the token, Save.

The token is generated on the first run of either this or `bridge/server.js`, whichever
comes first. They share `~/.homebase/config.json`.

If a bridge is already listening on port 8787, this server talks to it over HTTP rather than
starting a second one, so the state file only ever has one writer.

## Tools

Reading:

| Tool | Returns |
| --- | --- |
| `homebase_get_state` | everything, with the revision number |
| `homebase_list_tiles` | tiles and folders in display order, with their indexes |
| `homebase_list_notes` | sticky notes with their ids |
| `homebase_get_settings` | the settings, typed |
| `homebase_export` | a backup file's contents, `full`, `settings` or `links` |

Writing:

| Tool | Does |
| --- | --- |
| `homebase_add_tile` | add a tile, at the top level or into a folder |
| `homebase_update_tile` | change a tile's name, URL or icon |
| `homebase_remove_tile` | remove a tile or a folder |
| `homebase_move_tile` | move a tile anywhere, including in and out of folders |
| `homebase_create_folder` | add an empty folder |
| `homebase_move_to_folder` | move a tile into a folder |
| `homebase_create_note` | add a sticky note |
| `homebase_update_note` | change a sticky note |
| `homebase_set_settings` | change settings |
| `homebase_set_background` | set the background image |
| `homebase_import` | replace everything from a backup |

### Addressing a tile

By **path**: `[2]` is the third tile at the top level, `[2, 0]` is the first tile inside the
folder that sits third. `homebase_list_tiles` prints both.

`homebase_move_tile` reads its `to` against the list once the tile has been taken out, which
is the same rule the grid uses when you drag one.

## Security

The new tab page is the surface the user clicks most, so a tool that can write a URL onto it
is worth being careful with. Anything reaching these tools may have come from text the model
was asked to read.

- **A tile's URL must be `http` or `https`.** `javascript:` and `data:` are refused, as are
  `file:` and everything else. A tile is navigated to when it is clicked.
- **An icon or a background may also be a `data:image/...` URL**, because those are rendered
  as images and never navigated to, and an inline image is the form the extension itself
  stores a chosen background in. `data:text/html` is refused.
- **`homebase_import` will not run without `confirm: true`.** It replaces every tile, note
  and setting, and there is no undo. Called without it, it returns an error saying to ask
  the user first.
- **`HOMEBASE_MCP_READONLY=1` turns off every write tool.** They stay listed, with the
  reason in their description, and refuse when called.

The first release ships with the write tools on and read-only as an opt-in. Turning that
around, so writes have to be asked for, is a one-line change in `mcp/server.js`.

## Checking it by hand

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/server.js
```

stdout carries JSON-RPC and nothing else. Everything the server has to say goes to stderr.
