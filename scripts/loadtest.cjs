#!/usr/bin/env node
/*
 * loadtest.cjs — what does this actually hold?
 *
 *   node scripts/loadtest.cjs                         10 requests in flight, 10s
 *   node scripts/loadtest.cjs --levels 10,25,50,100    a ramp
 *   node scripts/loadtest.cjs --duration 15 --gate     fail if p95/error-rate trip
 *   node scripts/loadtest.cjs --only /health           isolate one endpoint
 *
 * `--only` exists because a blended number explains nothing. The first run of
 * this tool showed a ~40 req/s plateau with p95 at 10s and zero errors — queueing,
 * not failing — and the only way to defend a capacity claim is to say WHICH part
 * saturates. Isolating /health (pure Express) from net-realization (which proxies
 * to the single-worker Python calculator) answers that in two short runs.
 *
 * "Lower transaction cost and more reliable buyer sourcing" is a claim about
 * behaviour under load, and nothing here had ever measured it. This produces a
 * number that can be defended: percentiles and throughput per concurrency level,
 * written to docs/evidence/loadtest.json with the target, the tool and the time.
 *
 * Deliberately dependency-free (plain node:http with a keep-alive agent). The
 * repo avoids dependencies it cannot declare, and a load generator is exactly
 * the kind of tool that gets installed and then forgotten.
 *
 * ── Where to point it ──────────────────────────────────────────────────────
 * Default target is the LOCAL stack, on purpose. The deployed API now carries
 * rate limiting (300 req/15min per IP, middleware/rateLimit.js), so a load test
 * against the public URL mostly measures the limiter: you will see 429s, which
 * is the limiter doing its job, not a capacity result. To load-test the
 * deployment, either raise KISAN_RATE_LIMIT_MAX on that service first, or read
 * the 429 rate as the answer to a different question ("what happens when one
 * client misbehaves") — both are valid, they are just not the same experiment.
 *
 *   127.0.0.1 lands on a sibling project's server on this box (documented in
 *   preflight.cjs), so the local default is [::1], which our backend owns.
 *
 * Exit: 0 always, unless --gate is passed and p95 or the error rate exceeds
 * --max-p95-ms / --max-error-rate.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const TARGET = (process.env.KISAN_API_URL || argValue('--target', 'http://[::1]:5000')).replace(/\/$/, '');
const LEVELS = String(argValue('--levels', '10,25,50,100')).split(',').map((n) => Number.parseInt(n, 10)).filter((n) => n > 0);
const DURATION_MS = Number.parseInt(argValue('--duration', '10'), 10) * 1000;
const GATE = argv.includes('--gate');
const MAX_P95_MS = Number.parseInt(argValue('--max-p95-ms', '2500'), 10);
const MAX_ERROR_RATE = Number.parseFloat(argValue('--max-error-rate', '0.05'));

// The reads a farmer's session actually makes, round-robined so one cheap
// endpoint cannot flatter the result. net-realization is the expensive path
// (it calls the Python calculator), which is why it is in the mix.
const ENDPOINTS = [
  { path: '/health', weight: 1 },
  { path: '/api/market/prices?crop=Onion&state=Maharashtra', weight: 2 },
  { path: '/api/market/net-realization?crop=Onion&district=Nashik&quantity=10', weight: 2 },
  { path: '/api/buyers?crop=Onion&district=Nashik', weight: 1 },
  { path: '/api/grade-assessment/crops', weight: 1 },
];
// Git Bash rewrites an argument that starts with a slash into a Windows path:
// `--only /health` arrives as `C:/Program Files/Git/health`. This bit the layout
// harness before (.harness/probe-align2.cjs) and it bit this script on its first
// use, so compare on the last path segment only.
const rawFilter = argValue('--only', null);
const ROUTE_FILTER = rawFilter ? rawFilter.replace(/\\/g, '/').split('/').filter(Boolean).pop() : null;
const ROUTES = (ROUTE_FILTER
  ? ENDPOINTS.filter((e) => e.path.includes(ROUTE_FILTER)).map((e) => e.path)
  : ENDPOINTS.flatMap((e) => Array.from({ length: e.weight }, () => e.path)));

if (!ROUTES.length) {
  console.error(`--only ${ROUTE_FILTER} matched no endpoint. Known: ${ENDPOINTS.map((e) => e.path).join(', ')}`);
  process.exit(1);
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });

function request(route) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = http.request(`${TARGET}${route}`, { agent, method: 'GET' }, (res) => {
      res.resume(); // drain
      res.on('end', () => {
        resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6, route });
      });
    });
    req.on('error', (err) => {
      resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6, route, error: err.code || err.message });
    });
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 10) / 10;
}

async function runLevel(concurrency) {
  const samples = [];
  let i = 0;
  const deadline = Date.now() + DURATION_MS;

  async function worker() {
    while (Date.now() < deadline) {
      const route = ROUTES[i++ % ROUTES.length];
      samples.push(await request(route));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.status >= 200 && s.status < 400).length;
  const rateLimited = samples.filter((s) => s.status === 429).length;
  const failed = samples.filter((s) => s.status === 0 || s.status >= 500).length;
  const seconds = DURATION_MS / 1000;

  return {
    concurrency,
    requests: samples.length,
    rps: Math.round((samples.length / seconds) * 10) / 10,
    ok,
    rateLimited,
    failed,
    errorRate: samples.length ? Math.round((failed / samples.length) * 1000) / 1000 : 0,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    maxMs: latencies.length ? Math.round(latencies[latencies.length - 1] * 10) / 10 : null,
  };
}

(async () => {
  const startedAt = new Date().toISOString();
  console.log(`\nLoad test — ${TARGET}`);
  console.log(`levels: ${LEVELS.join(', ')} concurrent · ${DURATION_MS / 1000}s each · ${ROUTES.length}-route round-robin\n`);

  // Fail fast if nothing is listening: a 0% success table is not a result.
  const probe = await request('/health');
  if (probe.status !== 200) {
    console.error(`Nothing healthy at ${TARGET}/health (status ${probe.status}${probe.error ? `, ${probe.error}` : ''}).`);
    console.error('Start the stack with `bash scripts/dev-up.sh`, or point --target at a running host.');
    process.exit(1);
  }

  const levels = [];
  console.log('  conc   reqs     rps    p50      p95      p99     err    429');
  for (const concurrency of LEVELS) {
    const r = await runLevel(concurrency);
    levels.push(r);
    console.log(
      `  ${String(r.concurrency).padStart(4)}  ${String(r.requests).padStart(6)}  ${String(r.rps).padStart(6)}  ` +
      `${String(r.p50Ms).padStart(6)}ms ${String(r.p95Ms).padStart(7)}ms ${String(r.p99Ms).padStart(7)}ms  ` +
      `${String((r.errorRate * 100).toFixed(1)).padStart(4)}%  ${String(r.rateLimited).padStart(5)}`,
    );
  }

  const worst = levels[levels.length - 1];
  // One file per experiment. A blended run and an isolated run answer different
  // questions, and overwriting one with the other destroys the comparison.
  const EVIDENCE_FILE = path.join(
    ROOT, 'docs', 'evidence',
    ROUTE_FILTER ? `loadtest-${ROUTE_FILTER.replace(/[^a-z0-9-]/gi, '')}.json` : 'loadtest.json',
  );

  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    target: TARGET,
    durationSeconds: DURATION_MS / 1000,
    endpoints: ENDPOINTS,
    only: ROUTE_FILTER,
    levels,
    headline: {
      maxConcurrency: worst.concurrency,
      rpsAtMaxConcurrency: worst.rps,
      p95MsAtMaxConcurrency: worst.p95Ms,
      errorRateAtMaxConcurrency: worst.errorRate,
      note: TARGET.includes('onrender.com')
        ? 'Ran against the deployed instance — if rateLimited > 0 the limiter shaped this result, not capacity.'
        : 'Ran against a local stack. Add KISAN_RATE_LIMIT_MAX considerations before repeating against the deployment.',
    },
  };
  fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(report, null, 2) + '\n');

  console.log(`\nheadline: ${worst.rps} req/s at ${worst.concurrency} concurrent · p95 ${worst.p95Ms}ms · ${(worst.errorRate * 100).toFixed(1)}% errors`);
  console.log(`Evidence: ${path.relative(ROOT, EVIDENCE_FILE)}`);

  if (GATE) {
    const problems = [];
    if (worst.p95Ms > MAX_P95_MS) problems.push(`p95 ${worst.p95Ms}ms > ${MAX_P95_MS}ms`);
    if (worst.errorRate > MAX_ERROR_RATE) problems.push(`error rate ${(worst.errorRate * 100).toFixed(1)}% > ${(MAX_ERROR_RATE * 100).toFixed(1)}%`);
    if (problems.length) {
      console.error(`\nGATE FAILED: ${problems.join(' | ')}`);
      process.exit(1);
    }
    console.log(`\nGATE PASSED (p95 ≤ ${MAX_P95_MS}ms, errors ≤ ${(MAX_ERROR_RATE * 100).toFixed(1)}%)`);
  }
  console.log('');
})();
