import { API_URL, apiFetch } from './api';

/* The engine's estimated best net for a (crop, district, quantity) triple.
 *
 * Three components on /trade each need this reference — LotEconomics,
 * OfferBenchmark and PaymentOutcome — and they mount once per row. Because a
 * screen can legitimately show several rows for the SAME triple (e.g. two lots
 * of Onion/Nashik/20 q), the page fired one identical request per row: measured
 * at 15x for a single triple, 30 requests on one /trade load.
 *
 * That waste was not free — it was 70% of the page's traffic, and it is what
 * used to trip the backend's 300-requests/15-min limiter during ordinary demo
 * use. Deduping here fixes the cause without touching how many rows render.
 *
 * Two mechanisms, both needed:
 *   • IN-FLIGHT dedupe — the rows mount in the same tick, so they all miss a
 *     naive cache and fire together. Storing the Promise (not the result) means
 *     the concurrent callers share one request.
 *   • A short TTL — the reference is a live market observation ("best net
 *     today"), so it must not be frozen for the whole session. Five minutes
 *     matches how stale a mandi quote can be before it is misleading.
 *
 * Failures are NOT cached: a transient error must be retryable, not sticky.
 */

export interface Benchmark {
  net: number;
  mandi: string;
}

const TTL_MS = 5 * 60 * 1000;

type Entry = { at: number; value: Promise<Benchmark | null> };

const cache = new Map<string, Entry>();

// Quantity arrives as a number from some callers and a string from others
// (a lot's `quantity` is numeric, an offer's can be a form value). Both produce
// the SAME request URL, so the key must normalise or the cache silently misses
// and the duplicate request comes straight back.
const keyOf = (crop: string, district: string, quantity: number | string) => {
  const n = Number(quantity);
  return `${crop}|${district}|${Number.isFinite(n) ? n : quantity}`;
};

/**
 * Estimated best farmer net per quintal for this crop/district/quantity.
 * Resolves to `null` when the reference genuinely cannot be computed (unknown
 * district, engine unreachable) — callers show "unavailable" rather than a
 * fabricated number.
 */
export function getBenchmark(
  crop?: string | null,
  district?: string | null,
  quantity?: number | string | null
): Promise<Benchmark | null> {
  if (!crop || !district || quantity == null) return Promise.resolve(null);

  const key = keyOf(crop, district, quantity);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = apiFetch(
    `${API_URL}/market/net-realization?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${quantity}`
  )
    .then((r) => r.json())
    .then((j) => {
      if (j?.success && j.rankedMandis?.length) {
        return {
          net: j.rankedMandis[0].farmerNetPerQuintal,
          mandi: j.rankedMandis[0].market,
        } as Benchmark;
      }
      return null;
    })
    .catch(() => {
      // Drop the entry so the next mount retries instead of caching the failure.
      cache.delete(key);
      return null;
    });

  cache.set(key, { at: Date.now(), value });
  return value;
}
