// Dependency-free logger (winston was imported but never declared in
// package.json — this keeps logging without the extra dependency).
const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };
const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
const minLevel = LEVEL_ORDER[configured] !== undefined ? LEVEL_ORDER[configured] : LEVEL_ORDER.info;

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
  error: (...args) => { if (LEVEL_ORDER.error >= minLevel) emit('error', args); },
  warn: (...args) => { if (LEVEL_ORDER.warn >= minLevel) emit('warn', args); },
  info: (...args) => { if (LEVEL_ORDER.info >= minLevel) emit('info', args); },
  debug: (...args) => { if (LEVEL_ORDER.debug >= minLevel) emit('debug', args); },
};

module.exports = logger;
