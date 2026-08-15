// The state on disk, plus the revision counter the two sides use to order writes.
//
// The shape is validated with js/state.js, the same file the extension uses, so the bridge
// cannot drift from the page it is talking to.

const State = require("../../js/state.js");
const { STATE_FILE, readJson, writeJsonAtomic } = require("./config.js");

function emptyRecord() {
  return { rev: 0, updatedAt: null, state: State.createState({}), background: null };
}

function read() {
  const raw = readJson(STATE_FILE, null);
  if (!raw || typeof raw !== "object") return emptyRecord();
  return {
    rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    state: State.createState(raw.state),
    background: typeof raw.background === "string" ? raw.background : null,
  };
}

// Stores `state` as the next revision. `at` is passed in so a caller can stamp a write with
// the time it received it rather than the time it finished writing.
//
// `background` is left alone when it is undefined. The extension omits it on every write,
// because it is a data URL of up to a few hundred KB and resending it on each tile drag
// would be wasteful; only a caller that means to change it sends it.
function write(state, at, background) {
  const current = read();
  const record = {
    rev: current.rev + 1,
    updatedAt: at || new Date().toISOString(),
    state: State.createState(state),
    background: background === undefined ? current.background : background,
  };
  writeJsonAtomic(STATE_FILE, record);
  return record;
}

module.exports = { read, write, emptyRecord };
