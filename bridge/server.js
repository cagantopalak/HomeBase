#!/usr/bin/env node
// The HomeBase bridge: the extension's state, readable and writable from outside the
// browser.
//
// Threat model. A loopback port is reachable by any page the user visits and by any program
// running as the user. A cross-origin request cannot read the reply without CORS, but it
// can still cause the write. Three things together close that:
//
//   1. Every request carries a token. On anything that writes it must be the
//      X-HomeBase-Token header, which forces a preflight on a cross-origin request, so the
//      write never happens unless the preflight was answered.
//   2. The preflight answers only for an allowed Origin, which means only an extension.
//   3. The socket is bound to 127.0.0.1, so nothing off this machine reaches it at all.
//
// GET /events is the exception on point 1: EventSource cannot set a header, so its token
// comes from the query string. It reads and never writes, and it still has to pass the
// Origin check to be readable at all.

const http = require("http");
const crypto = require("crypto");
const { PORT, loadConfig, HOME } = require("./lib/config.js");
const store = require("./lib/state-store.js");

const config = loadConfig();
const clients = new Set();

/* ---------- AUTH ---------- */

function tokenMatches(candidate) {
  if (typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.token);
  // Compare in constant time, but only once the lengths match: timingSafeEqual throws on a
  // length mismatch, and the length of a token is not a secret.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// An empty allowlist means any extension origin, which still rejects every http and https
// page. Pin it to your own extension id in ~/.homebase/config.json once you know it.
function originAllowed(origin) {
  if (!origin) return false;
  if (config.allowedOrigins.length > 0) return config.allowedOrigins.includes(origin);
  return /^(chrome|moz)-extension:\/\/[^/]+$/.test(origin);
}

/* ---------- REPLIES ---------- */

function send(res, status, body, origin) {
  const payload = body === null ? "" : JSON.stringify(body);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  };
  // Only ever echoed for an origin that passed the check, so a rejected caller gets a reply
  // its browser will not let it read.
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------- SSE ---------- */

function broadcast(record) {
  const payload = `data: ${JSON.stringify(record)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(payload);
    } catch (err) {
      clients.delete(client);
    }
  });
}

function openEventStream(req, res, origin) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "access-control-allow-origin": origin,
    vary: "Origin",
  });
  res.write("retry: 3000\n\n");
  res.write(`data: ${JSON.stringify(store.read())}\n\n`);
  clients.add(res);

  // Without traffic an idle proxy or the browser may drop the connection.
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (err) {
      clearInterval(ping);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

/* ---------- ROUTING ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const origin = req.headers.origin;
  const allowed = originAllowed(origin);

  if (req.method === "OPTIONS") {
    if (!allowed) {
      // No CORS headers at all: the browser refuses the request that would have followed.
      send(res, 403, { error: "origin not allowed" }, null);
      return;
    }
    res.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, PUT, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-HomeBase-Token",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    res.end();
    return;
  }

  // A request with no Origin at all is a program on this machine rather than a page, for
  // instance the MCP server or curl. It still needs the token.
  if (origin && !allowed) {
    send(res, 403, { error: "origin not allowed" }, null);
    return;
  }
  const replyOrigin = allowed ? origin : null;

  if (url.pathname === "/events" && req.method === "GET") {
    // EventSource cannot set headers, so this one route takes the token from the query.
    if (!tokenMatches(url.searchParams.get("token"))) {
      send(res, 401, { error: "bad token" }, replyOrigin);
      return;
    }
    if (origin && !allowed) {
      send(res, 403, { error: "origin not allowed" }, null);
      return;
    }
    openEventStream(req, res, replyOrigin || "*");
    return;
  }

  if (!tokenMatches(req.headers["x-homebase-token"])) {
    send(res, 401, { error: "bad token" }, replyOrigin);
    return;
  }

  if (url.pathname === "/state" && req.method === "GET") {
    send(res, 200, store.read(), replyOrigin);
    return;
  }

  if (url.pathname === "/state" && req.method === "PUT") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      send(res, 400, { error: "invalid body" }, replyOrigin);
      return;
    }
    if (!body || typeof body !== "object" || !body.state) {
      send(res, 400, { error: "missing state" }, replyOrigin);
      return;
    }

    const current = store.read();
    const incomingRev = Number.isInteger(body.rev) ? body.rev : 0;

    // Last writer wins, except for a writer that never saw the current revision. That one
    // is working from a stale copy, so it is told what it missed instead.
    if (incomingRev < current.rev) {
      send(res, 409, Object.assign({ conflict: true }, current), replyOrigin);
      return;
    }

    const record = store.write(body.state, body.updatedAt);
    broadcast(record);
    send(res, 200, record, replyOrigin);
    return;
  }

  if (url.pathname === "/health" && req.method === "GET") {
    send(res, 200, { ok: true, rev: store.read().rev }, replyOrigin);
    return;
  }

  send(res, 404, { error: "not found" }, replyOrigin);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[homebase] bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`[homebase] state and config in ${HOME}`);
  if (config.created) {
    console.log("");
    console.log("[homebase] a token was generated. Paste it into the extension:");
    console.log("[homebase] new tab, right click the background, Settings, Sync.");
    console.log("");
    console.log(`    ${config.token}`);
    console.log("");
  }
  if (config.allowedOrigins.length === 0) {
    console.log(
      "[homebase] any extension origin is accepted. To pin it to yours, put its id in"
    );
    console.log('[homebase] allowedOrigins in config.json, as "chrome-extension://<id>".');
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[homebase] port ${PORT} is already in use. Another bridge is running.`);
    process.exit(1);
  }
  throw err;
});

module.exports = { server };
