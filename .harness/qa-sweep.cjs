/* End-to-end QA sweep.
 *
 * The layout probe (probe-align2.cjs) only checks geometry. This one checks
 * BEHAVIOUR: for every demo role it loads every route and records
 *
 *   • every /api/ response status  → catches 403/500s the UI swallows into an
 *     empty state (exactly how the FPO's empty offers book hid a 403)
 *   • every console error/warning  → catches render crashes and React warnings
 *   • whether the page rendered substantive content or an empty shell
 *
 * Usage: node .harness/qa-sweep.cjs
 * Requires the dev server on :3000 and the API on :5000.
 */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const API_DIRECT = 'http://127.0.0.1:5000';

const ROLES = ['farmer', 'buyer', 'fpo'];

// Routes reachable WITHOUT a session. They were a blind spot: a sweep that only
// drives authenticated roles never loads the landing page, the auth screens, or
// the 404 — the exact pages a judge sees first.
const PUBLIC_ROUTES = ['/', '/login', '/register', '/this-page-does-not-exist'];

// Every routed page. Roles that cannot see a page are still visited: the
// interesting result is whether the app redirects cleanly or half-renders.
const ROUTES = [
  '/dashboard', '/decision', '/net-realization', '/trade', '/buy', '/market',
  '/fpo', '/grade-crop', '/weather', '/schemes', '/community', '/farms',
  '/advisory', '/pathways', '/profile', '/settings',
];

// A route is allowed to be gated for a role; it is NOT allowed to error.
const EXPECTED_403 = [
  // a buyer never enters the producer-side selling flow
  { role: 'buyer', route: '/decision' },
];

async function login(role) {
  const res = await fetch(`${API_DIRECT}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`demo-login failed for ${role}`);
  return { token: data.token, user: data.user };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: process.cwd() + '/.harness/chrome-profile-qa',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const findings = [];
  const summary = [];

  // ── Public pass (no session) ──────────────────────────────────────────────
  {
    const page = await browser.newPage();
    let apiCalls = [];
    let consoleIssues = [];
    page.on('response', (r) => {
      if (!/\/api\//.test(r.url())) return;
      apiCalls.push({ url: r.url().replace(BASE, ''), status: r.status(), method: r.request().method() });
    });
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      const text = msg.text();
      if (/DevTools|Download the React/i.test(text)) return;
      consoleIssues.push(`${type}: ${text.slice(0, 200)}`);
    });
    page.on('pageerror', (err) => consoleIssues.push(`pageerror: ${String(err.message).slice(0, 200)}`));
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => localStorage.clear());

    for (const route of PUBLIC_ROUTES) {
      apiCalls = [];
      consoleIssues = [];
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
        const bodyText = (await page.evaluate(() => document.body.innerText || '')).trim();
        const failed = apiCalls.filter((c) => c.status >= 400);
        const rawKeys = [...new Set((bodyText.match(/\b[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9.]{2,}\b/g) || [])
          .filter((k) => !/\.(js|ts|json|com|in|net|org)$/.test(k)))].slice(0, 5);
        if (failed.length || consoleIssues.length || rawKeys.length || bodyText.length < 40) {
          findings.push({
            role: 'public', route, chars: bodyText.length, empty: bodyText.length < 40,
            failedCalls: failed, console: consoleIssues.slice(0, 5), rawKeys,
          });
        }
        summary.push({ role: 'public', route, authed: true, ok: failed.length === 0 && consoleIssues.length === 0 });
      } catch (err) {
        findings.push({ role: 'public', route, crash: String(err.message).slice(0, 200) });
        summary.push({ role: 'public', route, ok: false });
      }
    }
    await page.close();
  }

  for (const role of ROLES) {
    const { token, user } = await login(role);

    // ONE page per role. A fresh page starts on about:blank, where localStorage
    // is inaccessible — so seeding the session per route silently fails and
    // every request is unauthenticated. Seed once, then navigate client-side.
    const page = await browser.newPage();
    const apiCalls = [];
    let consoleIssues = [];

    page.on('response', (r) => {
      const url = r.url();
      if (!/\/api\//.test(url)) return;
      apiCalls.push({ url: url.replace(BASE, ''), status: r.status(), method: r.request().method() });
    });
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const text = msg.text();
        // React DevTools nag and Vite HMR chatter are not defects.
        if (/DevTools|Download the React/i.test(text)) return;
        consoleIssues.push(`${type}: ${text.slice(0, 200)}`);
      }
    });
    page.on('pageerror', (err) => consoleIssues.push(`pageerror: ${String(err.message).slice(0, 200)}`));

    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate((t, u) => {
      localStorage.setItem('kisan360_demo_token', t);
      localStorage.setItem('kisan360_demo_user', u);
      localStorage.setItem('kisan360-lang', 'en');
    }, token, JSON.stringify(user));
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

    for (const route of ROUTES) {
      apiCalls.length = 0;
      consoleIssues = [];
      try {
        const failed = [];
        await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        // Let deferred/effect-driven fetches land.
        await new Promise((r) => setTimeout(r, 2500));

        const bodyText = (await page.evaluate(() => document.body.innerText || '')).trim();
        const finalPath = new URL(page.url()).pathname;
        // Proof the sweep is authenticated: the app shell (topbar search +
        // sign-out) only renders for a logged-in session. Without this check a
        // sweep that silently bounced to /login would look perfectly "clean"
        // — no API calls, therefore no failures.
        const authed = await page.evaluate(() => {
          const t = document.body.innerText || '';
          return /Search crops, mandis/i.test(t) || document.querySelector('aside nav') !== null;
        });

        // raw-key rendering is the visible symptom of a missing translation
        const rawKeys = [...new Set((bodyText.match(/\b[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9.]{2,}\b/g) || [])
          .filter((k) => !/\.(js|ts|json|com|in|net|org)$/.test(k) && !/^\d/.test(k) && k.includes('.')))].slice(0, 5);

        for (const c of apiCalls) {
          if (c.status >= 400) failed.push(c);
        }

        if (failed.length || consoleIssues.length || rawKeys.length || bodyText.length < 40) {
          findings.push({
            role, route, finalPath,
            empty: bodyText.length < 40,
            chars: bodyText.length,
            failedCalls: failed,
            console: consoleIssues.slice(0, 5),
            rawKeys,
            expectedGated: EXPECTED_403.some((e) => e.role === role && (e.route === route || e.route === finalPath)),
          });
        }
        summary.push({ role, route, finalPath, authed, ok: failed.length === 0 && consoleIssues.length === 0 });
      } catch (err) {
        findings.push({ role, route, crash: String(err.message).slice(0, 200) });
        summary.push({ role, route, ok: false });
      }
    }
    await page.close();
  }

  await browser.close();

  const out = { generatedAt: new Date().toISOString(), findings, summaryCount: summary.length, summary };
  const unauthed = summary.filter((s) => !s.authed);
  fs.writeFileSync(process.cwd() + '/.harness/qa-report.json', JSON.stringify(out, null, 1));

  const publicCount = summary.filter((s) => s.role === 'public').length;
  console.log(`\nQA sweep: ${summary.length} page loads (${publicCount} public + ${ROLES.length} roles x ${ROUTES.length} routes)`);
  console.log(`authenticated: ${summary.length - unauthed.length}/${summary.length} | clean: ${summary.filter((s) => s.ok).length} | with findings: ${findings.length}`);
  if (unauthed.length) {
    console.log(`\nNOT AUTHENTICATED (page did not render the app shell):`);
    for (const u of unauthed) console.log(`   ${u.role} ${u.route} → ${u.finalPath}`);
  }
  console.log('');
  for (const f of findings) {
    console.log(`── ${f.role} ${f.route}${f.finalPath && f.finalPath !== f.route ? ` → ${f.finalPath}` : ''}${f.expectedGated ? '  [expected gating]' : ''}`);
    if (f.crash) console.log(`   CRASH ${f.crash}`);
    if (f.empty) console.log(`   EMPTY PAGE (${f.chars} chars)`);
    for (const c of f.failedCalls || []) console.log(`   API ${c.status} ${c.method} ${c.url}`);
    for (const c of f.console || []) console.log(`   ${c}`);
    if ((f.rawKeys || []).length) console.log(`   RAW KEYS ${f.rawKeys.join(', ')}`);
  }
  console.log('\nreport → .harness/qa-report.json');
})().catch((e) => { console.error('QA sweep failed:', e); process.exit(1); });
