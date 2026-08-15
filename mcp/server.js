#!/usr/bin/env node
// HomeBase over MCP, on stdio.
//
// This process also hosts the bridge from bridge/, so one command gives both the tools and
// the endpoint the extension talks to. If a bridge is already listening, this one talks to
// it over HTTP instead of opening a second copy, so there is only ever one writer.
//
// stdout carries JSON-RPC and nothing else. Everything else goes to stderr.

const bridge = require("../bridge/server.js");
const { build } = require("./lib/tools.js");

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "homebase", version: "7.3.0" };
const READ_ONLY = process.env.HOMEBASE_MCP_READONLY === "1";

const log = (...args) => console.error("[homebase-mcp]", ...args);

/* ---------- WHERE THE STATE IS ---------- */

// Hosting it: read and write the file directly, and broadcast to any open tab.
const hosted = {
  readState: () => bridge.readState(),
  writeState: (state, background) => bridge.writeState(state, background),
};

// Someone else is hosting it: go through them, so the file has one writer and their
// connected tabs still hear about the change.
function remote() {
  const base = `http://127.0.0.1:${bridge.PORT}`;
  const headers = {
    "content-type": "application/json",
    "X-HomeBase-Token": bridge.config.token,
  };

  // The tools are written against a synchronous store, so the record is kept here and
  // refreshed after every write.
  let cache = null;

  async function refresh() {
    const res = await fetch(`${base}/state`, { headers });
    if (!res.ok) throw new Error(`the running bridge answered ${res.status}`);
    cache = await res.json();
    return cache;
  }

  return {
    refresh,
    readState: () => cache,
    writeState: (state, background) => {
      const body = { rev: cache ? cache.rev : 0, state };
      if (background !== undefined) body.background = background;
      // Fire the write and fold the answer back into the cache. A tool returns before the
      // socket has finished, which is why the next tool call refreshes first.
      const promise = fetch(`${base}/state`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      })
        .then((res) => res.json())
        .then((record) => {
          cache = record;
          return record;
        });
      pendingWrites.push(promise.catch((err) => log("write to the running bridge failed:", err.message)));
      return { rev: (cache ? cache.rev : 0) + 1 };
    },
  };
}

const pendingWrites = [];
let backend = hosted;
let hosting = true;

/* ---------- JSON-RPC ON STDIO ---------- */

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolPayload(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

let tools = [];

function listTools() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.readOnly
      ? tool.description
      : READ_ONLY
        ? `${tool.description} (disabled: HOMEBASE_MCP_READONLY is set)`
        : tool.description,
    inputSchema: tool.inputSchema,
  }));
}

async function callTool(name, args) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return toolError(`there is no tool called ${name}`);

  if (!tool.readOnly && READ_ONLY) {
    return toolError(
      `${name} writes, and HOMEBASE_MCP_READONLY is set. Unset it and restart the server to allow writes.`
    );
  }

  try {
    // Talking to a bridge someone else is running: pick up whatever they have now, so two
    // writers do not overwrite each other with stale copies.
    if (!hosting) {
      await Promise.all(pendingWrites.splice(0));
      await backend.refresh();
    }
    return toolPayload(await tool.run(args || {}));
  } catch (err) {
    return toolError(err && err.message ? err.message : String(err));
  }
}

async function handle(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    reply(id, {
      // Answer in the version the client asked for when it named one, which is what keeps
      // an older client working.
      protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
    return;
  }

  // Notifications carry no id and want no answer.
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;

  if (method === "ping") {
    reply(id, {});
    return;
  }

  if (method === "tools/list") {
    reply(id, { tools: listTools() });
    return;
  }

  if (method === "tools/call") {
    const result = await callTool(params && params.name, params && params.arguments);
    reply(id, result);
    return;
  }

  if (id !== undefined) replyError(id, -32601, `method not found: ${method}`);
}

function readStdin() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (err) {
        log("ignoring a line that is not JSON");
        continue;
      }
      handle(message).catch((err) => {
        log("handler failed:", err.message);
        if (message.id !== undefined) replyError(message.id, -32603, err.message);
      });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

/* ---------- START ---------- */

async function main() {
  try {
    await bridge.listen(log);
  } catch (err) {
    if (err.code !== "EADDRINUSE") throw err;
    log("a bridge is already listening; using it rather than starting a second one");
    backend = remote();
    hosting = false;
    await backend.refresh().catch((e) => {
      log("could not reach the running bridge:", e.message);
      log("check that it is using the same token in ~/.homebase/config.json");
    });
  }

  tools = build(backend);
  if (READ_ONLY) log("read-only mode: the write tools will refuse.");
  log(`${tools.length} tools ready`);
  readStdin();
}

main().catch((err) => {
  log("could not start:", err && err.message);
  process.exit(1);
});
