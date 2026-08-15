// The state on disk, plus the revision counter the two sides use to order writes.
//
// The shape is validated with js/state.js, the same file the extension uses, so the bridge
// cannot drift from the page it is talking to.

const State = require("../../js/state.js");
const { STATE_FILE, readJson, writeJsonAtomic } = require("./config.js");

function emptyRecord() {
  return { rev: 0, updatedAt: null, state: State.createState({}) };
}

function read() {
  const raw = readJson(STATE_FILE, null);
  if (!raw || typeof raw !== "object") return emptyRecord();
  return {
    rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    state: State.createState(raw.state),
  };
}

// Stores `state` as the next revision. `at` is passed in so a caller can stamp a write with
// the time it received it rather than the time it finished writing.
function write(state, at) {
  const current = read();
  const record = {
    rev: current.rev + 1,
    updatedAt: at || new Date().toISOString(),
    state: State.createState(state),
  };
  writeJsonAtomic(STATE_FILE, record);
  return record;
}

module.exports = { read, write, emptyRecord };
