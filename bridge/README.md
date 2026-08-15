# The HomeBase bridge

A small Node server that holds the extension's state in a file, so something other than the
browser can read and write it. It is optional: the extension works without it, and does not
contact it unless you turn sync on.

No dependencies and no build step.

```sh
node bridge/server.js
```

It listens on `http://127.0.0.1:8787` and keeps everything in `~/.homebase`:

```
~/.homebase/config.json   the token and the origin allowlist, mode 600
~/.homebase/state.json    { rev, updatedAt, state }
```

## First run

The first run generates a token and prints it. Paste it into the extension:

1. Open a new tab, right click the background, choose Settings.
2. Under Sync, tick the checkbox and paste the token.
3. Save.

That is the whole setup. The token is also in `~/.homebase/config.json` if you need it
again.

## Why a loopback server rather than native messaging

Native messaging has the browser start the host process. An MCP server is started by the
program that wants to use it. One process cannot serve two owners of its stdio, so native
messaging would need a third daemon in between, plus a host manifest per browser and per
operating system, a pinned extension id, the install-time warning that comes with the
`nativeMessaging` permission, and a keepalive for the MV3 service worker. A loopback port
costs one open port and none of that.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/state` | the current record: `{ rev, updatedAt, state }` |
| `PUT` | `/state` | store a new state, body `{ rev, updatedAt, state }` |
| `GET` | `/events` | server-sent events, one message per write |
| `GET` | `/health` | `{ ok: true, rev }` |

```sh
TOKEN=$(node -e 'console.log(require(require("os").homedir()+"/.homebase/config.json").token)')
curl -s -H "X-HomeBase-Token: $TOKEN" http://127.0.0.1:8787/state
```

## Conflicts

Every write bumps `rev` by one. A `PUT` carrying the `rev` it last saw is accepted and
becomes the next revision. A `PUT` carrying an older `rev` is refused with `409` and the
current record, because that writer is working from a copy it has not caught up with. The
extension applies what it gets back.

Last writer wins, in other words, except for a writer that never saw what it would be
overwriting.

## Security

A loopback port is reachable by any page you visit and by any program running as you. A
cross-origin request cannot read the reply without CORS, but nothing stops it causing the
write. Three things together close that:

1. **A token on every request.** For anything that writes it must be the
   `X-HomeBase-Token` header. A custom header forces a preflight on a cross-origin request,
   so the write cannot happen unless the preflight was answered first.
2. **An `Origin` allowlist on the preflight.** Only an extension origin is answered, so a
   page on `https://example.com` is refused before its request is sent.
3. **Bound to `127.0.0.1`.** Nothing off this machine can open the socket.

`GET /events` is the one exception to the first point: `EventSource` cannot set a header, so
its token goes in the query string. It only ever reads, and it still has to pass the origin
check to be readable.

By default any `chrome-extension://` or `moz-extension://` origin is accepted, which already
refuses every `http` and `https` page. To narrow it to your own copy, put its id in
`config.json`:

```json
{
  "token": "…",
  "allowedOrigins": ["chrome-extension://abcdefghijklmnopabcdefghijklmnop"]
}
```

Chrome shows the id on `chrome://extensions` with Developer mode on. Firefox shows the
internal UUID on `about:debugging`.

Treat `~/.homebase/config.json` as a secret. Anyone who can read it can read and rewrite
your tiles and notes.

## Running it in the background

There is no service file. Under launchd or systemd, run `node bridge/server.js` with the
working directory set to the repository.
