// Dependency-free logger (winston was imported but never declared in
// package.json — this keeps logging without the extra dependency).
//
// LEVEL_ORDER is SEVERITY-DESCENDING: error (0) is the most severe, debug (3)
// the least. A message must print when it is at least as severe as the
// threshold, which with this ordering means a SMALLER OR EQUAL number.
//
// The guards here previously compared with `>=`, which inverted the gate: at
// the default LOG_LEVEL=info they evaluated 0 >= 2 and 1 >= 2, so every
// logger.error() and logger.warn() in the backend was silently discarded while
// debug logged by default. Real consequence: a route returning HTTP 500 with a
// generic message left NO trace in the log, and the cause had to be found by
// hand. An empty error log is worse than no logger at all.
const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };
const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
const minLevel = LEVEL_ORDER[configured] !== undefined ? LEVEL_ORDER[configured] : LEVEL_ORDER.info;
const shouldLog = (levelName) => LEVEL_ORDER[levelName] <= minLevel;

const timestamp = () => new Date().toISOString();

function stringify(arg) {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function emit(levelName, args) {
  const line = `[${timestamp()}] [${levelName.toUpperCase()}] ${args.map(stringify).join(' ')}`;
  if (levelName === 'error') console.error(line);
  else if (levelName === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  error: (...args) => { if (shouldLog('error')) emit('error', args); },
  warn: (...args) => { if (shouldLog('warn')) emit('warn', args); },
  info: (...args) => { if (shouldLog('info')) emit('info', args); },
  debug: (...args) => { if (shouldLog('debug')) emit('debug', args); },
};

module.exports = logger;
