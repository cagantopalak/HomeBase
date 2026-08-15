// Config and state files under ~/.homebase.
//
// The token is generated once, on first run, and printed so it can be pasted into the
// extension's settings. It is the only thing standing between the bridge and any program
// on this machine that can reach a loopback port.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const HOME = path.join(os.homedir(), ".homebase");
const CONFIG_FILE = path.join(HOME, "config.json");
const STATE_FILE = path.join(HOME, "state.json");

// Fixed rather than configurable: the extension manifests have to name the origin they are
// allowed to reach, and a manifest cannot list a port the user picks later.
const PORT = 8787;

function ensureHome() {
  // Owner-only. The token lives in here.
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`[homebase] ${file} is unreadable, starting from the default:`, err.message);
    }
    return fallback;
  }
}

// Writes through a temporary file in the same directory, so a crash mid-write leaves the
// previous contents rather than half of the new ones.
function writeJsonAtomic(file, value, mode) {
  ensureHome();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: mode || 0o600 });
  fs.renameSync(tmp, file);
}

function loadConfig() {
  ensureHome();
  const existing = readJson(CONFIG_FILE, null);
  if (existing && typeof existing.token === "string" && existing.token.length >= 32) {
    return {
      token: existing.token,
      // An empty list means any extension origin. Pin it to your own extension id once you
      // know it; see bridge/README.md.
      allowedOrigins: Array.isArray(existing.allowedOrigins) ? existing.allowedOrigins : [],
      created: false,
    };
  }

  const config = { token: crypto.randomBytes(32).toString("hex"), allowedOrigins: [] };
  writeJsonAtomic(CONFIG_FILE, config, 0o600);
  return Object.assign({}, config, { created: true });
}

module.exports = { HOME, CONFIG_FILE, STATE_FILE, PORT, loadConfig, readJson, writeJsonAtomic };
