#!/usr/bin/env node
/*
 * probe-deploy.cjs — is the PUBLIC deployment alive, or only its shell?
 *
 *   node scripts/probe-deploy.cjs                  probe all three services
 *   node scripts/probe-deploy.cjs --timeout 180    allow a longer cold start
 *   node scripts/probe-deploy.cjs --json-only      write evidence, skip the table
 *
 * Why this exists: the public URL can look healthy while being unusable. On
 * 2026-09-23 the frontend answered 200 with the correct <title> while both
 * backends answered 503 — a judge opening the link would see the app shell and
 * then every number would fail to load. A browser cannot tell those apart, and
 * neither can a status code read once:
 *
 *   • a Render free-tier service that is SPUN DOWN answers 503 while it boots
 *     (50s+), then goes 200 — that is a warm-up problem;
 *   • a service that was never created answers 404;
 *   • a service that crashed at boot answers 503 forever — that is a real bug.
 *
 * So this polls with backoff and reports which one it is, per service, plus
 * whether the deployed bundle actually points at the deployed API (the failure
 * the deploy guide warns about: VITE_API_URL is baked at build time).
 *
 * It also checks the deployment's EXPOSURE (this URL is public): protected books
 * must reject anonymous callers, the database host must not be served to
 * anonymous callers, and CORS must not allow an arbitrary origin.
 *
 * Exit: 0 = live and clean · 2 = live but with a finding to fix (a shell-only
 * deployment, or an exposure failure) · 1 = not deployed at all.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'deploy-probe.json');

const argv = process.argv.slice(2);
const timeoutArg = argv.indexOf('--timeout');
// Cold starts on Render free tier were measured at 50s+; 120s default leaves
// room for a queue without hanging CI for 5 minutes.
const TIMEOUT_MS = (timeoutArg !== -1 ? Number(argv[timeoutArg + 1]) : 120) * 1000;
const JSON_ONLY = argv.includes('--json-only');
const POLL_MS = 5000;

// Overridable so the same probe can point at a staging host or localhost.
const SERVICES = [
  { key: 'web', name: 'kisan360-web', url: process.env.KISAN_DEPLOY_WEB || 'https://kisan360-web.onrender.com', path: '/' },
  { key: 'api', name: 'kisan360-api', url: process.env.KISAN_DEPLOY_API || 'https://kisan360-api.onrender.com', path: '/health' },
  { key: 'calc', name: 'kisan360-calc', url: process.env.KISAN_DEPLOY_CALC || 'https://kisan360-calc.onrender.com', path: '/health' },
];

const EXPECTED_API_HOST = new URL(SERVICES[1].url).host;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url, timeoutMs = 20000) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* html or plain text */ }
    // Keep real HTML: the wiring check has to find Vite's module <script src>,
    // which sits well past the first few hundred bytes of <head>.
    return { status: res.status, ms: Date.now() - started, body, text: body ? '' : text.slice(0, 200000) };
  } catch (err) {
    return { status: 0, ms: Date.now() - started, body: null, text: String(err && err.name === 'TimeoutError' ? 'timeout' : err.message) };
  }
}

/** Request the deployed API directly (used by the exposure checks). */
async function callApi(method, route, token, timeoutMs = 20000, extraHeaders) {
  const headers = { Accept: 'application/json', ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(SERVICES[1].url + route, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    const hdrs = {};
    res.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
    return { status: res.status, body, headers: hdrs };
  } catch (err) {
    return { status: 0, body: null, headers: {}, error: String(err && err.name === 'TimeoutError' ? 'timeout' : err.message) };
  }
}

/**
 * Poll one service until it answers 2xx, or the window closes. The first
 * response is reported separately from the last: a 503-then-200 is a cold
 * start, a 503 throughout is a service that is not coming up.
 */
async function probeService(service) {
  const url = service.url + service.path;
  const deadline = Date.now() + TIMEOUT_MS;
  const attempts = [];
  let first = null;
  let last = null;

  while (true) {
    const r = await fetchOnce(url);
    last = r;
    if (first === null) first = r;
    attempts.push({ status: r.status, ms: r.ms, at: new Date().toISOString() });
    if (r.status >= 200 && r.status < 300) break;
    // 404 will never become 200 by waiting (the service name is unclaimed).
    if (r.status === 404 || r.status === 401 || r.status === 403) break;
    if (Date.now() >= deadline) break;
    await sleep(Math.min(POLL_MS, Math.max(500, deadline - Date.now())));
  }

  const live = last.status >= 200 && last.status < 300;
  const coldStart = live && first.status !== last.status ? first.status : null;
  const bootMs = live && first.status !== last.status ? last.ms : null;

  let verdict;
  if (live) verdict = coldStart ? 'cold-start' : 'live';
  else if (last.status === 404) verdict = 'not-deployed';
  else if (last.status === 0) verdict = 'unreachable';
  else if (last.status === 503) verdict = 'sleeping-or-failed';
  else if (last.status === 502 || last.status === 504) verdict = 'bad-gateway';
  else verdict = `http-${last.status}`;

  const detail = {
    service: service.name,
    url,
    verdict,
    attempts: attempts.length,
    firstStatus: first.status,
    lastStatus: last.status,
    bootMs,
    health: last.body || null,
    note: last.status === 0 ? last.text : null,
  };
  return detail;
}

/**
 * Does the DEPLOYED bundle actually call the DEPLOYED API?
 *
 * VITE_API_URL is baked at build time, so a stale environment variable leaves
 * a live-looking frontend calling the wrong host (or a same-origin /api that
 * does not exist). The browser only fails at request time, so check the built
 * artefact directly. Heuristic by nature — reported as a hint, not a verdict.
 */
async function checkWiring() {
  const root = SERVICES[0].url + '/';
  const html = await fetchOnce(root, 30000);
  if (html.status !== 200) return { checked: false, reason: `frontend returned ${html.status}` };

  const srcs = [...(html.text || '').matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => { try { return new URL(m[1], root).href; } catch { return null; } })
    .filter(Boolean)
    .slice(0, 8);
  if (!srcs.length) return { checked: false, reason: 'no script tags found in served HTML' };

  const hosts = new Set();
  let relativeApi = false;
  let scanned = 0;
  for (const src of srcs) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const code = await res.text();
      scanned += 1;
      for (const m of code.matchAll(/https?:\/\/[a-z0-9.-]+\.onrender\.com/g)) hosts.add(m[0]);
      // axios/fetch base set to a bare "/api" — correct only if the host also
      // proxies /api, which the static site does not.
      if (/["'`]\/api["'`]/.test(code)) relativeApi = true;
    } catch { /* one asset failing is not a wiring verdict */ }
  }

  const apiHosts = [...hosts].filter((h) => /api|calc/.test(h));
  const pointsAtApi = apiHosts.some((h) => h.includes(EXPECTED_API_HOST));
  return {
    checked: true,
    assetsScanned: scanned,
    onrenderHostsFound: [...hosts],
    apiHostsFound: apiHosts,
    relativeApiBaseFound: relativeApi,
    expectedApiHost: EXPECTED_API_HOST,
    pointsAtApi,
    verdict: !apiHosts.length
      ? 'no deployed API host found in bundle — VITE_API_URL likely unset at build'
      : pointsAtApi ? 'bundle points at the deployed API' : `bundle points at ${apiHosts.join(', ')}`,
  };
}

/**
 * Exposure checks — the deployment is public, so its posture is part of being
 * qualified. Each of these was a real finding on the live stack:
 *
 *   • anonymous GET /api/diagnostics returned `database.host`, which on Atlas is
 *     the cluster endpoint (recon material for credential stuffing);
 *   • protected books must reject anonymous callers;
 *   • CORS must not echo an arbitrary origin while ALLOWING it (a browser would
 *     reject a mismatched value, so this asserts the value is not the caller's).
 */
async function checkExposure() {
  const checks = [];

  for (const route of ['/api/payments', '/api/grievances']) {
    const r = await callApi('GET', route, null, 20000);
    checks.push({ name: `${route} rejects anonymous callers`, ok: r.status === 401, detail: `HTTP ${r.status}` });
  }

  const diag = await callApi('GET', '/api/diagnostics', null, 25000);
  const body = JSON.stringify(diag.body || {});
  const leakedHost = /\.mongodb\.net|shard-\d\d/.test(body) || !!(diag.body && diag.body.database && diag.body.database.host);
  checks.push({
    name: 'anonymous diagnostics does not expose the database host',
    ok: diag.status === 200 && !leakedHost,
    detail: diag.status !== 200 ? `HTTP ${diag.status}` : leakedHost ? 'database host/endpoint is served to anonymous callers' : 'status served, no host',
  });

  const foreign = await callApi('GET', '/health', null, 20000, { Origin: 'https://evil.example' });
  const acao = foreign.headers && foreign.headers['access-control-allow-origin'];
  checks.push({
    name: 'CORS does not allow an arbitrary origin',
    ok: !acao || acao === 'null' || !acao.includes('evil.example'),
    detail: acao ? `allow-origin: ${acao}` : 'no allow-origin header',
  });

  return checks;
}

function summariseHealth(detail) {
  if (!detail.health) return null;
  const h = detail.health;
  return {
    status: h.status || null,
    database: h.database || h.dbMode || null,
    scheduler: h.scheduler ? (h.scheduler.consecutiveFailures ? `failing (${h.scheduler.consecutiveFailures})` : 'ok') : null,
    ml: h.ml ? (h.ml.ready ? 'ready' : 'not ready') : null,
  };
}

(async () => {
  const startedAt = new Date().toISOString();
  if (!JSON_ONLY) {
    console.log(`\nDeploy probe — ${SERVICES.map((s) => s.url).join(' · ')}`);
    console.log(`Cold-start allowance: ${TIMEOUT_MS / 1000}s per service\n`);
  }

  const services = [];
  for (const s of SERVICES) {
    const detail = await probeService(s);
    detail.summary = summariseHealth(detail);
    services.push(detail);
    if (!JSON_ONLY) {
      const icon = detail.verdict === 'live' ? 'OK  ' : detail.verdict === 'cold-start' ? 'WARM' : 'FAIL';
      const boot = detail.bootMs != null ? ` (booted in ${(detail.bootMs / 1000).toFixed(1)}s)` : '';
      console.log(`  ${icon}  ${detail.service.padEnd(14)} ${String(detail.lastStatus).padStart(3)}  ${detail.verdict}${boot}`);
      if (detail.summary) {
        const bits = Object.entries(detail.summary).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
        if (bits.length) console.log(`        ${bits.join(' · ')}`);
      }
      if (detail.note) console.log(`        ${detail.note}`);
      if (detail.verdict === 'not-deployed') console.log('        no service answers this name — create it in Render (see docs/DEPLOYMENT_GUIDE.md)');
      if (detail.verdict === 'sleeping-or-failed') console.log('        503 for the whole window: spun down but booting is normal → run the keepalive workflow; still 503 after that means it crashed at boot → read the service logs');
    }
  }

  const wiring = await checkWiring().catch((e) => ({ checked: false, reason: e.message }));
  if (!JSON_ONLY) {
    console.log('\n  Frontend wiring (is the deployed bundle calling the deployed API?)');
    if (!wiring.checked) console.log(`        skipped — ${wiring.reason}`);
    else {
      console.log(`        ${wiring.pointsAtApi ? 'OK  ' : 'WARN'}  ${wiring.verdict}`);
      console.log(`        scanned ${wiring.assetsScanned} asset(s); onrender hosts seen: ${wiring.onrenderHostsFound.join(', ') || 'none'}`);
    }
  }

  const web = services.find((s) => s.service === 'kisan360-web');
  const backends = services.filter((s) => s.service !== 'kisan360-web');
  const webLive = web && (web.verdict === 'live' || web.verdict === 'cold-start');
  const backendsLive = backends.every((s) => s.verdict === 'live' || s.verdict === 'cold-start');

  const exposure = backendsLive
    ? await checkExposure().catch((e) => [{ name: 'exposure checks', ok: false, detail: e.message }])
    : [{ name: 'exposure checks', ok: false, detail: 'skipped — API not live' }];
  if (!JSON_ONLY) {
    console.log('\n  Exposure (this deployment is public)');
    for (const c of exposure) console.log(`        ${c.ok ? 'OK  ' : 'FAIL'}  ${c.name} — ${c.detail}`);
  }
  const exposureFailed = exposure.filter((c) => !c.ok);

  const verdict = webLive && backendsLive
    ? (exposureFailed.length ? `LIVE WITH ${exposureFailed.length} EXPOSURE FINDING(S)` : 'DEPLOYED AND LIVE')
    : webLive ? 'SHELL ONLY — frontend live, backends not'
    : 'NOT DEPLOYED';

  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    coldStartAllowanceMs: TIMEOUT_MS,
    verdict,
    services,
    frontendWiring: wiring,
    exposure,
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(report, null, 2) + '\n');

  if (!JSON_ONLY) {
    console.log(`\nVERDICT: ${verdict}`);
    console.log(`Evidence: ${path.relative(ROOT, EVIDENCE_FILE)}`);
    if (!backendsLive) {
      console.log('\nNext: warm the stack and re-run —');
      console.log('  curl -s -o /dev/null -w "%{http_code}\\n" ' + SERVICES[1].url + '/health');
      console.log('  curl -s -o /dev/null -w "%{http_code}\\n" ' + SERVICES[2].url + '/health');
      console.log('  (or trigger .github/workflows/keepalive.yml with workflow_dispatch)\n');
    }
  }

  if (webLive && exposureFailed.length) {
    console.log('\nFix the exposure finding(s) above, then re-run. Deployment changes go live on push to the deployed branch.');
  }
  process.exit(webLive && backendsLive && !exposureFailed.length ? 0 : webLive ? 2 : 1);
})().catch((err) => {
  console.error('probe-deploy failed:', err.message);
  process.exit(1);
});
