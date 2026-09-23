/**
 * rateLimit.js — request limiting for the public deployment.
 *
 * History worth keeping: this project HAD a global limiter, it was removed at
 * the team's request because it throttled local runs, and docs/DEPLOYMENT_GUIDE.md
 * kept advertising it ("global 300 req/15min per IP, 30 demo-logins/15min") —
 * so the guide described production controls that no longer existed. Meanwhile
 * the API is on a public URL and /api/auth/demo-login mints tokens for anyone
 * who asks.
 *
 * This restores the protection WITHOUT the friction, by making it a deployment
 * concern instead of a code concern:
 *
 *   KISAN_RATE_LIMIT=off   never limits (development, demo, the browser harness)
 *   KISAN_RATE_LIMIT=on    always limits
 *   (unset)                limits only when NODE_ENV=production
 *
 * So a local `npm run dev`, the 204-combo layout sweep and the demo all run
 * unthrottled, while the deployed API is protected and the guide is true again.
 *
 * The previous implementation also answered a throttled request with the
 * PLAIN-TEXT body "Too many requests", which the frontend tried to JSON.parse —
 * surfacing to the user as `Unexpected token 'T', "Too many r"... is not valid
 * JSON`. Every response here is JSON, always.
 *
 * Implemented locally rather than by adding express-rate-limit: the repo avoids
 * dependencies it cannot declare (see the note in utils/logger.js about winston).
 * One process, one Map. This is not a distributed limiter and does not pretend
 * to be — behind multiple instances each would keep its own window.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes, matching the documented figure
const DEFAULT_MAX = 300;          // general /api budget per IP per window
const DEFAULT_AUTH_MAX = 30;      // demo-login: token minting is the sharp edge

function isEnabled() {
  const flag = String(process.env.KISAN_RATE_LIMIT || '').toLowerCase();
  if (flag === 'off' || flag === '0' || flag === 'false') return false;
  if (flag === 'on' || flag === '1' || flag === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function clientKey(req) {
  return (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');
}

/**
 * Build a fixed-window limiter. A fixed window (rather than a sliding log) is
 * deliberate: it is trivially explainable and cheap, and for abuse control the
 * boundary burst is an acceptable trade.
 */
function createRateLimiter({ windowMs = WINDOW_MS, max = DEFAULT_MAX, name = 'api', enabled = isEnabled() } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Bound memory: drop expired windows when the map grows. Lazily, so an idle
  // server does no work at all.
  function sweep(now) {
    if (hits.size < 5000) return;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  function middleware(req, res, next) {
    if (!enabled) return next();

    const now = Date.now();
    sweep(now);

    const key = clientKey(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));
      // JSON, always — a plain-text body here is what produced the frontend's
      // "Unexpected token 'T'" error instead of a readable message.
      return res.status(429).json({
        success: false,
        error: `Too many requests from this address. Limit: ${max} per ${Math.round(windowMs / 60000)} minutes. Retry in ${resetSeconds}s.`,
        retryAfterSeconds: resetSeconds,
        limitName: name,
      });
    }
    return next();
  }

  middleware.reset = () => hits.clear();
  middleware.stats = () => ({ size: hits.size, max, windowMs, name, enabled });
  return middleware;
}

/** The limiters the server mounts, built once at boot. */
function buildLimiters() {
  const enabled = isEnabled();
  return {
    enabled,
    global: createRateLimiter({
      enabled,
      name: 'api',
      max: Number.parseInt(process.env.KISAN_RATE_LIMIT_MAX, 10) || DEFAULT_MAX,
    }),
    auth: createRateLimiter({
      enabled,
      name: 'auth',
      max: Number.parseInt(process.env.KISAN_RATE_LIMIT_AUTH_MAX, 10) || DEFAULT_AUTH_MAX,
    }),
  };
}

module.exports = { createRateLimiter, buildLimiters, isEnabled, WINDOW_MS, DEFAULT_MAX, DEFAULT_AUTH_MAX };
