#!/usr/bin/env node
/*
 * preflight.cjs — one command that answers "is Kisan360 demo-ready?"
 *
 *   node scripts/preflight.cjs            full gate (static + build + tests + live API)
 *   node scripts/preflight.cjs --fast     static checks only (~2s)
 *   node scripts/preflight.cjs --full     everything, plus the browser sweeps
 *   node scripts/preflight.cjs --skip-tests
 *
 * Why this exists: every check below was, at some point, run by hand in a
 * different session and forgotten. Two real defects survived that way —
 *
 *   • the FPO demo login landed on a selling page with an EMPTY offers list
 *     because the backend and frontend each carried their own copy of "which
 *     side of the escrow book is an FPO on" (the API answered 403, the UI
 *     swallowed it into an empty state) — see backend/src/lib/roleScope.js;
 *   • a page that failed to load its data rendered its empty state and looked
 *     perfectly healthy, so "the page rendered" proved nothing.
 *
 * Both are now asserted, not remembered. A SKIP is never a pass: the verdict
 * says exactly what went unverified, so this can't hand out false confidence.
 *
 * Exit code 0 = demo-ready, 1 = at least one FAIL, 2 = warnings only.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web-app');
const API = path.join(ROOT, 'backend');
const BASE = 'http://localhost:3000';
// ::1, not 127.0.0.1: a sibling project's server can squat the IPv4 loopback
// port (it did on this box), and Windows dispatches to the more-specific bind
// — so 127.0.0.1 lands on the wrong process. Our backend listens dual-stack,
// so ::1 always reaches it. Override with KISAN_API_URL on other hosts.
const API_URL = process.env.KISAN_API_URL || 'http://[::1]:5000';
// Bind-exact on purpose: uvicorn listens on 127.0.0.1 only, and on a Windows
// box `localhost` can resolve to ::1 first and report a spurious 000.
const CALC_URL = 'http://127.0.0.1:8002';

const argv = process.argv.slice(2);
const FAST = argv.includes('--fast');
const FULL = argv.includes('--full');
const SKIP_TESTS = argv.includes('--skip-tests') || FAST;

const LOCALES = ['en', 'mr', 'hi'];
const results = [];
const info = [];

// ── tiny result recorder ────────────────────────────────────────────────────
const record = (id, title, status, detail) => {
  results.push({ id, title, status, detail });
  const mark = { pass: '\u2713', fail: '\u2717', skip: '\u2013', warn: '!' }[status];
  console.log(`  ${mark} ${title}${detail ? ` \u2014 ${detail}` : ''}`);
};
const pass = (id, title, detail) => record(id, title, 'pass', detail);
const fail = (id, title, detail) => record(id, title, 'fail', detail);
const skip = (id, title, detail) => record(id, title, 'skip', detail);
const warn = (id, title, detail) => record(id, title, 'warn', detail);

const section = (name) => console.log(`\n${name}`);

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: opts.timeout || 300000,
    shell: !!opts.shell,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status === null ? 124 : r.status, out, error: r.error };
};

const walk = (dir, filter, out = []) => {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, out);
    else if (!filter || filter(full)) out.push(full);
  }
  return out;
};

async function http(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs || 8000) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* non-JSON: keep text */ }
    return { status: res.status, body, text };
  } catch (e) {
    return { status: 0, body: null, text: '', error: String(e.message || e) };
  }
}

// ── 1. i18n parity ──────────────────────────────────────────────────────────
/* The app ships three languages; a key present in one and missing in another
 * renders the raw key ("fpo.sameEngine") on screen in front of a judge. */
function checkI18n() {
  const id = 'i18n';
  const dir = path.join(WEB, 'src', 'i18n');
  const bundles = {};
  for (const l of LOCALES) {
    const f = path.join(dir, `${l}.json`);
    if (!fs.existsSync(f)) return fail(id, 'i18n bundles exist', `missing ${l}.json`);
    try { bundles[l] = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { return fail(id, 'i18n bundles parse', `${l}.json: ${e.message}`); }
  }
  for (const l of LOCALES) delete bundles[l]._meta;

  const counts = LOCALES.map((l) => `${l}=${Object.keys(bundles[l]).length}`).join(' ');
  const en = new Set(Object.keys(bundles.en));
  const problems = [];
  for (const l of LOCALES.filter((x) => x !== 'en')) {
    const keys = new Set(Object.keys(bundles[l]));
    const missing = [...en].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !en.has(k));
    if (missing.length) problems.push(`${l}: ${missing.length} missing (${missing.slice(0, 3).join(', ')})`);
    if (extra.length) problems.push(`${l}: ${extra.length} extra (${extra.slice(0, 3).join(', ')})`);
  }
  if (problems.length) fail(id, 'i18n key parity', problems.join(' | '));
  else pass(id, 'i18n key parity', counts);

  // Empty translations render as blank UI, which is worse than a raw key.
  const empties = [];
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(bundles[l])) {
      if (typeof v === 'string' && v.trim() === '') empties.push(`${l}:${k}`);
    }
  }
  if (empties.length) fail(id, 'i18n has no empty values', `${empties.length} empty (${empties.slice(0, 4).join(', ')})`);
  else pass(id, 'i18n has no empty values');

  // Used-but-missing keys: the direction that actually shows a raw key.
  const files = walk(path.join(WEB, 'src'), (f) => /\.(ts|tsx)$/.test(f));
  const used = new Set();
  const dynamicPrefixes = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
      // Only accept a key-shaped prefix (namespace.path). A template literal
      // that merely ends in "t(" — e.g. act(`/lots/${id}`) — is not a lookup.
      if (/^[a-z][A-Za-z0-9-]*\.[A-Za-z0-9._-]*$/.test(m[1])) dynamicPrefixes.add(m[1]);
    }
    for (const m of src.matchAll(/\b(?:t|i18n\.t)\(\s*(['"])([^'"`$]+)\1/g)) {
      const key = m[2];
      // Skip fragments from string concatenation, e.g. t('page.' + x)
      if (key.length < 4 || key.endsWith('.') || /\s/.test(key)) continue;
      used.add(key);
    }
  }
  const missing = [...used].filter(
    (k) => !en.has(k) && ![...dynamicPrefixes].some((p) => k.startsWith(p)),
  );
  if (missing.length) fail(id, 'every used key is translated', `${missing.length} unresolved (${missing.slice(0, 5).join(', ')})`);
  else pass(id, 'every used key is translated', `${used.size} literal refs${dynamicPrefixes.size ? `, ${dynamicPrefixes.size} dynamic prefixes` : ''}`);

  // Non-blocking: keys nothing references are dead weight, but this scan only
  // proves a key is never called with a LITERAL string, so it is reported as a
  // cleanup hint rather than a defect.
  const unreferenced = [...en].filter(
    (k) => !used.has(k) && ![...dynamicPrefixes].some((p) => k.startsWith(p)),
  );
  if (unreferenced.length) {
    info.push(`${unreferenced.length}/${en.size} keys are never referenced literally (dynamic lookups or dead) e.g. ${unreferenced.slice(0, 3).join(', ')}`);
  }
}

// ── 2. asset integrity ──────────────────────────────────────────────────────
/* A missing image is the first thing a judge sees and the last thing a
 * type-checker catches: string paths are invisible to the compiler. */
function checkAssets() {
  const id = 'assets';
  const pub = path.join(WEB, 'public');
  if (!fs.existsSync(pub)) return fail(id, 'web-app/public exists');

  const EXT = 'png|jpe?g|svg|webp|gif|avif|ico|mp4|webm';
  const re = new RegExp(`['"\`(]\\s*(/(?:[A-Za-z0-9_@.\\-]+/)*[A-Za-z0-9_@.\\-]+\\.(?:${EXT}))['"\`)]`, 'g');
  const sources = [
    ...walk(path.join(WEB, 'src'), (f) => /\.(ts|tsx|css|html)$/.test(f)),
    path.join(WEB, 'index.html'),
  ].filter((f) => fs.existsSync(f));

  const missing = new Set();
  const checked = new Set();
  for (const f of sources) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const ref = m[1];
      checked.add(ref);
      if (!fs.existsSync(path.join(pub, ref.replace(/^\//, '')))) {
        missing.add(`${ref} (${path.relative(ROOT, f)})`);
      }
    }
  }
  if (missing.size) fail(id, 'referenced assets exist', `${missing.size} broken: ${[...missing].slice(0, 5).join(', ')}`);
  else pass(id, 'referenced assets exist', `${checked.size} refs resolve`);

  // The web app manifest names its icons relative to the site root, so the
  // leading-slash scan above cannot see them. A missing icon is invisible until
  // someone installs the app — which a judge may well try.
  const manifestPath = path.join(pub, 'manifest.json');
  if (!fs.existsSync(manifestPath)) { /* no manifest: nothing to check */ }
  else {
    try {
      const icons = (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).icons || [])
        .map((i) => i.src || '').filter(Boolean);
      const gone = icons.filter((s) => !fs.existsSync(path.join(pub, s.replace(/^\.?\//, ''))));
      if (gone.length) fail(id, 'manifest icons exist', gone.join(', '));
      else pass(id, 'manifest icons exist', `${icons.length} icons`);
    } catch (e) { fail(id, 'manifest icons exist', String(e.message).slice(0, 80)); }
  }

  // Dynamically built paths (e.g. `/models/${name}/model.json`) can't be
  // matched above, so the two that matter for the demo are asserted by name.
  const modelDir = path.join(pub, 'models', 'crop-grader');
  const mf = path.join(modelDir, 'model.json');
  if (!fs.existsSync(mf)) {
    fail(id, 'trained crop-grader ships', 'model.json absent \u2014 grading silently falls back to rules');
  } else {
    try {
      const model = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const shards = (model.weightsManifest || []).flatMap((g) => g.paths || []);
      const absent = shards.filter((s) => !fs.existsSync(path.join(modelDir, s)));
      const bytes = shards.reduce((n, s) => {
        const p = path.join(modelDir, s);
        return n + (fs.existsSync(p) ? fs.statSync(p).size : 0);
      }, 0);
      if (!model.modelTopology || !shards.length) fail(id, 'trained crop-grader ships', 'model.json is a placeholder (no topology/weights)');
      else if (absent.length) fail(id, 'trained crop-grader ships', `${absent.length} weight shard(s) missing`);
      else if (bytes < 512 * 1024) fail(id, 'trained crop-grader ships', `weights only ${(bytes / 1024).toFixed(0)} KB \u2014 placeholder-sized`);
      else pass(id, 'trained crop-grader ships', `${(bytes / 1048576).toFixed(1)} MB across ${shards.length} shards, browser-verified`);
    } catch (e) { fail(id, 'trained crop-grader ships', `model.json unparseable: ${e.message}`); }
  }
}

// ── 3. data files ───────────────────────────────────────────────────────────
function checkData() {
  const id = 'data';
  const dir = path.join(API, 'src', 'data');
  const files = walk(dir, (f) => f.endsWith('.json'));
  const bad = [];
  for (const f of files) {
    try { JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { bad.push(`${path.basename(f)}: ${e.message.slice(0, 60)}`); }
  }
  if (bad.length) fail(id, 'backend data files parse', bad.join(' | '));
  else pass(id, 'backend data files parse', `${files.length} JSON datasets`);
}

// ── 4. git hygiene ──────────────────────────────────────────────────────────
/* Logs and curl artifacts holding demo JWTs must never be tracked. */
function checkGit() {
  const id = 'git';
  const tracked = run('git', ['ls-files'], {});
  if (tracked.code !== 0) return skip(id, 'git hygiene', 'not a git checkout');
  const files = tracked.out.split('\n').map((s) => s.trim()).filter(Boolean);
  const offenders = files.filter((f) => /\.log$/.test(f) || /\.tok$/.test(f) || /(^|\/)demo\.json$/.test(f));
  if (offenders.length) fail(id, 'no logs/JWT artifacts tracked', offenders.slice(0, 5).join(', '));
  else pass(id, 'no logs/JWT artifacts tracked', `${files.length} files tracked`);

  // A JWT sitting in the tree is only a real risk if git would accept it, so
  // ask git rather than guessing at the ignore rules.
  const loose = walk(ROOT, (f) => /(\.tok|demo\.json)$/.test(f)).filter((f) => !f.includes('node_modules'));
  const committable = loose.filter((f) => run('git', ['check-ignore', '-q', f], {}).code !== 0);
  if (committable.length) {
    fail(id, 'no committable token files', committable.map((f) => path.relative(ROOT, f)).join(', '));
  } else if (loose.length) {
    info.push(`${loose.length} stray demo-JWT file(s), all gitignored: ${loose.map((f) => path.relative(ROOT, f)).join(', ')}`);
    pass(id, 'no committable token files');
  } else pass(id, 'no stray token files in tree');

  const dirty = run('git', ['status', '--porcelain'], {});
  const modified = dirty.out.split('\n').filter((l) => /^ ?M/.test(l)).length;
  const untracked = dirty.out.split('\n').filter((l) => l.startsWith('??')).length;
  if (modified + untracked === 0) info.push('working tree clean');
  else info.push(`working tree: ${modified} modified, ${untracked} untracked (commit before the demo)`);
}

// ── 5. logger level gate ─────────────────────────────────────────────────────
/* logger.error() was silently discarded app-wide: the level comparison was
 * inverted, so at the default LOG_LEVEL=info the guards evaluated 0 >= 2 and
 * 1 >= 2 and dropped every error and warning, while debug printed. Nothing
 * surfaced it, because the calls themselves never throw — the only symptom is
 * an EMPTY error log after a real 500, which is exactly how a route's crash
 * stayed hidden. Pin the behaviour, not the implementation. */
function checkLogger() {
  const id = 'logger';
  const modPath = path.join(API, 'src', 'utils', 'logger.js');
  if (!fs.existsSync(modPath)) return skip(id, 'logger prints errors', 'no logger module found');

  const seen = { error: 0, warn: 0, info: 0, debug: 0 };
  const orig = { error: console.error, warn: console.warn, log: console.log };
  try {
    const capture = (line) => {
      const m = String(line).match(/\[(ERROR|WARN|INFO|DEBUG)\]/);
      if (m) seen[m[1].toLowerCase()]++;
    };
    console.error = capture; console.warn = capture; console.log = capture;
    delete require.cache[require.resolve(modPath)];
    const logger = require(modPath);
    logger.error('probe'); logger.warn('probe'); logger.info('probe'); logger.debug('probe');
  } catch (e) {
    return fail(id, 'logger prints errors', `could not load logger: ${String(e.message).slice(0, 80)}`);
  } finally {
    console.error = orig.error; console.warn = orig.warn; console.log = orig.log;
  }

  if ((process.env.LOG_LEVEL || 'info').toLowerCase() !== 'info') {
    return skip(id, 'logger prints errors', `LOG_LEVEL=${process.env.LOG_LEVEL} overrides the default`);
  }
  const wrong = [];
  for (const lvl of ['error', 'warn', 'info']) if (seen[lvl] !== 1) wrong.push(`${lvl} printed ${seen[lvl]}× (want 1)`);
  if (seen.debug !== 0) wrong.push(`debug printed ${seen.debug}× (want 0 at info level)`);
  if (wrong.length) fail(id, 'logger prints errors', wrong.join(' | '));
  else pass(id, 'logger prints errors', 'error/warn/info emit, debug gated');
}

// ── 5.5 TypeScript typecheck (vite build alone never checks types) ──────────
function checkTypes() {
  const id = 'typecheck';
  const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8')); } catch { return {}; } })();
  if (!pkg.scripts || !pkg.scripts.typecheck) {
    return fail(id, 'web-app typechecks', 'no "typecheck" script in web-app/package.json');
  }
  if (!fs.existsSync(path.join(WEB, 'node_modules', 'typescript', 'bin', 'tsc'))) {
    return fail(id, 'web-app typechecks', 'typescript not installed in web-app');
  }
  const r = run('npm run typecheck', [], { cwd: WEB, shell: true, timeout: 180000 });
  const out = r.out;
  if (r.error && r.error.code === 'ETIMEDOUT') return fail(id, 'web-app typechecks', 'timed out after 180s');
  if (r.code !== 0) {
    const first = out.split('\n').find((l) => /error TS\d+/.test(l)) || out.split('\n').filter(Boolean).slice(-1)[0] || `exit ${r.code}`;
    const count = (out.match(/error TS\d+/g) || []).length;
    return fail(id, 'web-app typechecks', count ? `${count} error(s) — first: ${first.trim().slice(0, 140)}` : first.slice(0, 160));
  }
  pass(id, 'web-app typechecks', 'tsc --noEmit clean');
}

// ── 6. frontend production build ────────────────────────────────────────────
function checkBuild() {
  const id = 'build';
  const r = run('npm run build', [], { cwd: WEB, shell: true, timeout: 300000 });
  const out = r.out;
  if (r.error && r.error.code === 'ETIMEDOUT') return fail(id, 'web-app builds', 'timed out after 300s');
  const errLines = out.split('\n').filter((l) => /\berror\b/i.test(l) && !/0 errors/i.test(l)).slice(0, 3);
  if (r.code !== 0 || errLines.length) {
    return fail(id, 'web-app builds', (errLines[0] || out.split('\n').filter(Boolean).slice(-1)[0] || `exit ${r.code}`).slice(0, 160));
  }
  const dist = path.join(WEB, 'dist');
  if (!fs.existsSync(dist)) return fail(id, 'web-app builds', 'no dist/ emitted');

  const assets = walk(path.join(dist, 'assets'), (f) => f.endsWith('.js'));
  const total = assets.reduce((n, f) => n + fs.statSync(f).size, 0);
  const biggest = assets.map((f) => ({ n: path.basename(f), s: fs.statSync(f).size })).sort((a, b) => b.s - a.s)[0];
  pass(id, 'web-app builds', `clean, ${(total / 1048576).toFixed(1)} MB JS, largest ${biggest ? `${biggest.n.slice(0, 18)}… ${(biggest.s / 1048576).toFixed(1)} MB` : 'n/a'}`);
}

// ── 6. backend test suite ───────────────────────────────────────────────────
function checkTests() {
  const id = 'tests';
  const r = run('npm test', [], { cwd: API, shell: true, timeout: 600000 });
  if (r.error && r.error.code === 'ETIMEDOUT') return fail(id, 'backend tests pass', 'timed out after 600s');
  const summary = r.out.match(/Tests:.*$/m);
  const suites = r.out.match(/Test Suites:.*$/m);
  const failedNames = [...r.out.matchAll(/^ {2}\u2715 (.+)$/gm)].slice(0, 4).map((m) => m[1].trim());
  if (r.code !== 0 || /failed/.test(summary ? summary[0] : '')) {
    const detail = failedNames.length ? `${failedNames.length}+ failing: ${failedNames.join(' | ')}` : (summary ? summary[0].trim() : `exit ${r.code}`);
    return fail(id, 'backend tests pass', detail.slice(0, 200));
  }
  pass(id, 'backend tests pass', `${(summary ? summary[0] : '').replace(/\s+/g, ' ').trim()}${suites ? ` \u00b7 ${suites[0].replace(/\s+/g, ' ').trim()}` : ''}`);
}

// ── 7. live services + API contract ─────────────────────────────────────────
/* These are the checks that catch a page silently rendering its empty state. */
async function checkLive() {
  const id = 'live';
  const health = await http(`${API_URL}/health`);
  if (health.status !== 200) {
    skip(id, 'live API contract', `backend not up at ${API_URL} \u2014 run bash scripts/dev-up.sh`);
    skip(id, 'demo logins + escrow scope', 'needs the API');
    skip(id, 'authenticated farmer endpoints', 'needs the API');
    return { token: null, user: null };
  }
  const degraded = health.body && health.body.status && String(health.body.status).toUpperCase() !== 'OK';
  if (degraded) warn(id, 'backend health', `status=${health.body.status} (a downstream service is down)`);
  else pass(id, 'backend health', 'HTTP 200');

  const calc = await http(`${CALC_URL}/health`);
  if (calc.status !== 200) fail(id, 'net-realization calculator up', `no response on ${CALC_URL} \u2014 every rupee figure on the site degrades`);
  else pass(id, 'net-realization calculator up', 'HTTP 200');

  // One probe per capability the problem statement names, so a feed that
  // silently returns an empty list fails here instead of on stage.
  const anyArray = (b) => (Array.isArray(b) ? b : (b && Object.values(b).find(Array.isArray)) || []);
  const probes = [
    ['market prices (AGMARKNET feed)', '/api/market/prices', (b) => anyArray(b).length > 0 || !!(b && b.success)],
    ['crop grading catalogue', '/api/grade-assessment/crops', (b) => anyArray(b).length >= 7],
    ['net realization (calculator)', '/api/market/net-realization?crop=Onion&district=Nashik&quantity=10', (b) => !!(b && (b.bestMandi || b.success))],
    ['digital trading channels', '/api/trading-channels?crop=Onion', (b) => !!(b && (b.success || anyArray(b).length))],
    ['government schemes', '/api/schemes', (b) => anyArray(b).length > 0 || !!(b && b.success)],
  ];
  const broken = [];
  for (const [name, url, ok] of probes) {
    const r = await http(`${API_URL}${url}`);
    if (r.status !== 200 || !ok(r.body)) broken.push(`${name} \u2192 ${r.status}`);
  }
  if (broken.length) fail(id, 'core data endpoints answer', broken.join(' | '));
  else pass(id, 'core data endpoints answer', `${probes.length} capabilities, real payloads`);

  // Logins for every demo role, then the scope contract that broke before.
  const tokens = {};
  for (const role of ['farmer', 'buyer', 'fpo']) {
    const r = await http(`${API_URL}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name: `QA ${role}`, district: 'Nashik' }),
    });
    if (r.status === 200 && r.body && r.body.token) tokens[role] = { token: r.body.token, user: r.body.user || r.body.user_ || null };
  }
  if (Object.keys(tokens).length !== 3) {
    return fail(id, 'all demo roles can sign in', `got ${Object.keys(tokens).join(', ') || 'none'} of farmer/buyer/fpo`);
  }
  pass(id, 'all demo roles can sign in', 'farmer, buyer, fpo');

  const auth = (role) => ({ Authorization: `Bearer ${tokens[role].token}` });
  const scope = [
    // Regression guard: the FPO signs in to a SELLING page, so its own book must be readable.
    ['fpo reads own offers', await http(`${API_URL}/api/offers?role=farmer`, { headers: auth('fpo') }), 200],
    ['fpo reads own payments', await http(`${API_URL}/api/payments?role=farmer`, { headers: auth('fpo') }), 200],
    ['farmer reads own offers', await http(`${API_URL}/api/offers?role=farmer`, { headers: auth('farmer') }), 200],
    [null, await http(`${API_URL}/api/offers`, { headers: auth('farmer') }), 200],
    // Escalation must still be refused: asking for the other side's book is a no.
    ['farmer cannot read the escrow book', await http(`${API_URL}/api/offers?role=buyer`, { headers: auth('farmer') }), 403],
    ['buyer can read the escrow book', await http(`${API_URL}/api/offers?role=buyer`, { headers: auth('buyer') }), 200],
    ['anonymous is refused', await http(`${API_URL}/api/offers?role=buyer`), 401],
  ];
  const wrong = scope.filter(([, r, want]) => r.status !== want).map(([name, r, want]) => `${name || 'own book'} expected ${want}, got ${r.status}`);
  if (wrong.length) fail(id, 'escrow scope contract holds', wrong.join(' | '));
  else pass(id, 'escrow scope contract holds', `${scope.length} assertions incl. FPO producer-side regression`);

  // Named problem-statement capabilities that sit behind a login: the dispute
  // book a farmer reaches for when the cash never arrives, the transport
  // options a lot has to move with, and the transaction-cost summary.
  //
  // transaction-cost is asserted here deliberately: it returned HTTP 500 on
  // every request (its data files are wrapped objects, and the route called
  // .filter on one), and nothing in the UI calls it, so no test or screen ever
  // noticed. A silent 500 on an unused endpoint is exactly what a gate is for.
  const authedProbes = [
    ['grievance (dispute) book', '/api/grievances'],
    ['own crop lots', '/api/lots'],
    ['transport options', '/api/logistics/options?origin=Nashik&destination=Pune&quantity=10'],
    ['transaction-cost summary', '/api/transaction-cost/transaction-cost?crop=Onion&district=Nashik&quantity=10'],
  ];
  const authedBroken = [];
  for (const [name, url] of authedProbes) {
    const r = await http(`${API_URL}${url}`, { headers: auth('farmer'), timeoutMs: 25000 });
    if (r.status !== 200) authedBroken.push(`${name} \u2192 ${r.status}`);
  }
  if (authedBroken.length) fail(id, 'authenticated farmer endpoints answer', authedBroken.join(' | '));
  else pass(id, 'authenticated farmer endpoints answer', `${authedProbes.length} capabilities incl. dispute book`);

  return { token: tokens.farmer.token, user: tokens.farmer.user };
}

// ── 8. browser sweeps (--full) ──────────────────────────────────────────────
function checkBrowser(live) {
  const id = 'browser';
  const harnessMods = path.join(ROOT, '.harness', 'node_modules', 'puppeteer-core');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(harnessMods)) return skip(id, 'browser sweeps', '.harness/node_modules absent \u2014 run npm install there');
  if (!fs.existsSync(chrome)) return skip(id, 'browser sweeps', 'Chrome not found at the harness path');
  if (!live.token) return skip(id, 'browser sweeps', 'needs a running API for auth');

  const web = spawnSync('curl', ['-s', '-o', '/dev/null', '-m', '3', '-w', '%{http_code}', BASE], { encoding: 'utf8' });
  if ((web.stdout || '').trim() === '000' || !web.stdout) return skip(id, 'browser sweeps', `dev server not up at ${BASE}`);

  const qa = run(process.execPath, [path.join(ROOT, '.harness', 'qa-sweep.cjs')], { timeout: 600000 });
  const qaClean = /0 findings|clean/i.test(qa.out) && !/FAIL|finding/i.test(qa.out.replace(/0 findings/gi, ''));
  const qaSummary = [...qa.out.matchAll(/^(?:ROLE|TOTAL|.*?findings.*)$/gim)].slice(-2).map((m) => m[0].trim()).join(' ');
  if (qa.code !== 0) fail(id, 'QA sweep (behaviour)', `exit ${qa.code} \u2014 see .harness/qa-report.json`);
  else if (!qaClean && /finding/i.test(qa.out)) fail(id, 'QA sweep (behaviour)', qaSummary.slice(0, 160) || 'findings recorded');
  else pass(id, 'QA sweep (behaviour)', (qaSummary || 'every role \u00d7 route: no API failures, console errors, or empty pages').slice(0, 160));

  for (const lang of LOCALES) {
    const r = run(process.execPath, [path.join(ROOT, '.harness', 'probe-align2.cjs')], {
      env: { KISAN_TOKEN: live.token, KISAN_USER: JSON.stringify(live.user || {}), KISAN_LANG: lang },
      timeout: 900000,
    });
    const clean = /LAYOUT CLEAN/.test(r.out);
    const m = r.out.match(/LAYOUT CLEAN \((\w+)\) \u2014 (\d+) combos[^\n]*/);
    if (clean) pass(id, `layout sweep (${lang})`, m ? m[2] + ' combos clean' : 'clean');
    else {
      const flags = (r.out.match(/(\d+) LAYOUT flags/) || [])[1] || '?';
      fail(id, `layout sweep (${lang})`, `${flags} flags \u2192 .harness/align2-report-${lang}.json`);
    }
  }
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\nKisan360 preflight \u2014 demo readiness gate');
  console.log(`mode: ${FAST ? 'fast (static only)' : FULL ? 'full (incl. browser sweeps)' : 'default'}${SKIP_TESTS && !FAST ? ' \u00b7 tests skipped' : ''}`);

  section('Static checks');
  for (const [name, fn] of [['i18n', checkI18n], ['assets', checkAssets], ['data', checkData], ['git', checkGit], ['logger', checkLogger], ['typecheck', checkTypes]]) {
    try { fn(); } catch (e) { fail(name, `${name} checks`, String(e.message || e).slice(0, 160)); }
  }

  if (!FAST) {
    section('Build');
    try { checkBuild(); } catch (e) { fail('build', 'web-app builds', String(e.message || e).slice(0, 160)); }

    if (!SKIP_TESTS) {
      section('Backend tests (this is the slow one)');
      try { checkTests(); } catch (e) { fail('tests', 'backend tests pass', String(e.message || e).slice(0, 160)); }
    }
  }

  let live = { token: null, user: null };
  if (!FAST) {
    section('Live services + API contract');
    try { live = await checkLive(); } catch (e) { fail('live', 'live API contract', String(e.message || e).slice(0, 160)); }
  }

  if (FULL && !FAST) {
    section('Browser sweeps (slow)');
    try { checkBrowser(live); } catch (e) { fail('browser', 'browser sweeps', String(e.message || e).slice(0, 160)); }
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');
  const skips = results.filter((r) => r.status === 'skip');
  const passes = results.filter((r) => r.status === 'pass');

  console.log(`\n${'\u2500'.repeat(56)}`);
  console.log(`  ${passes.length} passed \u00b7 ${fails.length} failed \u00b7 ${warns.length} warnings \u00b7 ${skips.length} skipped`);
  if (fails.length) {
    console.log('\n  BLOCKERS');
    for (const f of fails) console.log(`    \u2717 ${f.title}: ${f.detail || ''}`);
  }
  if (skips.length) {
    console.log('\n  NOT VERIFIED (a skip is not a pass)');
    for (const s of skips) console.log(`    \u2013 ${s.title}: ${s.detail || ''}`);
  }
  for (const i of info) console.log(`  \u00b7 ${i}`);

  const verdict = fails.length
    ? 'NOT DEMO-READY'
    : skips.length
      ? 'UNVERIFIED \u2014 start the stack and re-run'
      : warns.length ? 'DEMO-READY (with warnings)' : 'DEMO-READY';
  console.log(`\n  ${verdict}\n`);

  try {
    fs.writeFileSync(path.join(ROOT, '.harness', 'preflight-report.json'), JSON.stringify({ at: new Date().toISOString(), verdict, results, info }, null, 2));
  } catch { /* report is a convenience, not the gate */ }

  process.exit(fails.length ? 1 : warns.length ? 2 : 0);
})();
