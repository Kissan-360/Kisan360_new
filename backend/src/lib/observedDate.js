/**
 * observedDate.js — the one place that understands an AGMARKNET arrival date.
 *
 * AGMARKNET publishes arrival dates as DD/MM/YYYY. `new Date()` cannot be used
 * on that string, and using it silently produced two different wrong answers:
 *
 *   new Date('10/09/2026')  →  9 Oct 2026  (parsed as US MM/DD — a FUTURE date,
 *                                           ~16 days ahead of "now")
 *   new Date('22/09/2026')  →  Invalid Date (month 22 does not exist)
 *
 * Every consumer inherited the damage. On the live deployment on 2026-09-23 the
 * net-realization response reported `ageHours: -378.01` with
 * `freshnessLabel: FUTURE` for a 13-day-old observation, and the decision screen
 * rendered it literally as "-378.01h old". Because a day > 12 can never parse,
 * NO observation could ever report a correct age — half the dataset said FUTURE
 * and the other half said UNKNOWN.
 *
 * Sorting by the raw string was wrong for the same reason: `.sort()[0]` on
 * ['08/09/2026', '22/08/2026'] picks '08/09/2026' (day 8 < day 22), so the
 * "oldest observation" was whichever had the smallest day number — overstating
 * freshness, which is the dangerous direction for a data-provenance product.
 *
 * This module is deliberately tiny, pure and dependency-free so it can be the
 * single definition. The DD/MM reading is not a guess: it is the documented
 * wire format of the source and matches every stored row.
 */

/**
 * Parse an observed/arrival date into a Date at UTC midnight.
 * Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and full ISO timestamps.
 * @returns {Date|null} null when the value is absent or unparseable
 */
function parseObservedDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const s = String(value == null ? '' : value).trim();
  if (!s) return null;

  // DD/MM/YYYY — the AGMARKNET wire format. The 4-digit year group is what
  // keeps this from matching an ISO date.
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    // Reject impossible days (e.g. 31/02 rolling over into March).
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return d;
  }

  // YYYY-MM-DD, optionally with a time component.
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s)) {
    const d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Normalize to a sortable/storable 'YYYY-MM-DD' key.
 * @returns {string|null}
 */
function normalizeObservedDate(value) {
  const d = parseObservedDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Age of an observation in milliseconds, positive when it is in the past.
 * @returns {number|null} null when unparseable
 */
function ageMs(value, now = Date.now()) {
  const d = parseObservedDate(value);
  if (!d) return null;
  return now - d.getTime();
}

/**
 * The chronologically OLDEST value in a list, returned as the original string
 * (callers display it as `observedOn`). Null when nothing parses.
 */
function oldestObservedOn(values) {
  let bestRaw = null;
  let bestMs = Infinity;
  for (const v of values || []) {
    const d = parseObservedDate(v);
    if (!d) continue;
    const ms = d.getTime();
    if (ms < bestMs) {
      bestMs = ms;
      bestRaw = String(v).trim();
    }
  }
  return bestRaw;
}

/**
 * Comparator for sorting records by arrival date. Unparseable values sort last
 * so they can never be mistaken for the latest observation.
 */
function compareObservedDate(a, b) {
  const da = parseObservedDate(a);
  const db = parseObservedDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}

module.exports = {
  parseObservedDate,
  normalizeObservedDate,
  ageMs,
  oldestObservedOn,
  compareObservedDate,
};
