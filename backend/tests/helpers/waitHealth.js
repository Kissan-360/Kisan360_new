/**
 * waitHealth — wait for a spawned backend to answer /health.
 *
 * Extracted from six integration suites that each carried their own copy
 * (three subtly different variants) of the same 20-second wait. Two problems
 * came from that duplication:
 *
 *   1. Seven integration suites each spawn a real server AND a memory MongoDB,
 *      so on a loaded machine a boot can legitimately take longer than 20s.
 *      When that happened the failure was an intermittent "did not become
 *      healthy: fetch failed" — a flake with no diagnostic value.
 *   2. The error said nothing about what the server actually answered, so a
 *      503-because-a-dependency-is-down looked identical to a dead process.
 *
 * Now: one definition, a budget that tolerates a busy machine, and an error
 * that reports the last response observed.
 *
 * @param {string} url             health endpoint to poll
 * @param {number|object} options  timeout in ms, or { timeoutMs, pollMs }
 */
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_POLL_MS = 500;

module.exports = async function waitHealth(url, options = {}) {
  const opts = typeof options === 'number' ? { timeoutMs: options } : options;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const pollMs = opts.pollMs || DEFAULT_POLL_MS;

  const deadline = Date.now() + timeoutMs;
  let last = 'no response received';
  const started = Date.now();

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
      last = `HTTP ${res.status}`;
      if (res.status === 503) last += ' (booting, or a dependency is unavailable)';
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Backend did not answer ${url} within ${timeoutMs}ms (waited ${Date.now() - started}ms) — last observation: ${last}`,
  );
};
