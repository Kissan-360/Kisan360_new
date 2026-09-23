#!/usr/bin/env node
/**
 * a11y.cjs — WCAG A/AA sweep of every route, as an artifact instead of an opinion.
 *
 * TRL 8 asks whether the system is qualified, and "we tried to keep it
 * accessible" is not a qualification. This drives real Chrome over the app's
 * route table, runs axe-core in each page, and writes what it found to
 * docs/evidence/a11y.json — including the routes that pass, so a reader can see
 * the coverage rather than trust it.
 *
 * It is deliberately report-first: `--fail-on serious` decides the exit code, so
 * a sweep can be run for information without pretending a demo is blocked.
 *
 *   node scripts/a11y.cjs                          every route, English
 *   node scripts/a11y.cjs --lang mr                Marathi UI text
 *   node scripts/a11y.cjs --base http://localhost:3000 --fail-on serious
 *   node scripts/a11y.cjs --routes /dashboard,/trade
 *
 * Chrome: puppeteer-core is used with a system Chrome (no 150 MB download).
 * Set PUPPETEER_EXECUTABLE_PATH, or let it find the usual locations; if no
 * browser exists the script says so and exits 0, because CI runners without a
 * browser must not fail a code check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web-app');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const BASE = (arg('base', process.env.KISAN_BASE || 'http://localhost:3000')).replace(/\/$/, '');
const LANG = arg('lang', 'en');
const FAIL_ON = arg('fail-on', 'none');

// Authenticated app routes (see web-app/src/App.tsx) plus the public ones.
const PUBLIC_ROUTES = ['/', '/login', '/register'];
const APP_ROUTES = [
  '/dashboard', '/decision', '/disease-detection', '/weather', '/advisory',
  '/farms', '/market', '/net-realization', '/pathways', '/trade', '/buy',
  '/fpo', '/schemes', '/community', '/grade-crop', '/profile', '/settings',
];
const ROUTES = arg('routes')
  ? arg('routes').split(',').map((s) => s.trim()).filter(Boolean)
  : [...PUBLIC_ROUTES, ...APP_ROUTES];

function chromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function demoToken() {
  try {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'farmer', district: 'Nashik' }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.token ? json : null;
  } catch {
    return null;
  }
}

function summarise(violations) {
  const byImpact = {};
  for (const v of violations) byImpact[v.impact || 'unknown'] = (byImpact[v.impact || 'unknown'] || 0) + 1;
  return {
    count: violations.length,
    byImpact,
    details: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      // Selectors, not innerHTML: enough to fix the element, no page text stored.
      // All of them, not a sample — a fix list that hides half the elements is a
      // fix list that gets half the job done.
      targets: v.nodes.map((n) => (n.target || []).join(' ')).filter(Boolean),
    })),
  };
}

async function main() {
  const exe = chromePath();
  if (!exe) {
    console.log('⚠️  No Chrome found — skipping the accessibility sweep (set PUPPETEER_EXECUTABLE_PATH to enable).');
    process.exit(0);
  }
  let puppeteer;
  let axeSource;
  try {
    puppeteer = require(path.join(WEB, 'node_modules', 'puppeteer-core'));
    axeSource = fs.readFileSync(require.resolve(path.join(WEB, 'node_modules', 'axe-core', 'axe.js')), 'utf8');
  } catch (e) {
    console.log(`⚠️  puppeteer-core / axe-core not installed in web-app (${e.message}) — skipping.`);
    process.exit(0);
  }

  const auth = await demoToken();
  if (!auth) console.log('⚠️  demo-login failed — authenticated routes will render the login page (results still valid, coverage narrower).');

  console.log(`\n♿ Accessibility sweep — ${BASE} · ${ROUTES.length} routes · lang=${LANG}\n`);
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': LANG === 'mr' ? 'mr-IN,mr' : LANG === 'hi' ? 'hi-IN,hi' : 'en-IN,en' });

    // Seed the demo session once; every route shares the origin.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.evaluate((a, lang) => {
      localStorage.setItem('kisan360_demo_token', a.token);
      localStorage.setItem('kisan360_demo_user', JSON.stringify(a.user || {}));
      localStorage.setItem('kisan360-lang', lang);
    }, auth || { token: '', user: {} }, LANG);

    for (const route of ROUTES) {
      const started = Date.now();
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch { /* slow route: analyse what rendered */ }
      await new Promise((r) => setTimeout(r, 900));
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return res.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({ target: n.target })),
        }));
      });
      const summary = summarise(violations);
      results.push({ route, ms: Date.now() - started, ...summary });
      const mark = summary.count === 0 ? '✓' : (summary.byImpact.critical || summary.byImpact.serious) ? '✗' : '·';
      const breakdown = Object.entries(summary.byImpact).map(([k, n]) => `${n} ${k}`).join(', ');
      console.log(`  ${mark} ${route.padEnd(20)} ${summary.count === 0 ? 'clean' : breakdown}`);
    }
  } finally {
    await browser.close();
  }

  const totals = results.reduce((acc, r) => {
    for (const [k, n] of Object.entries(r.byImpact)) acc[k] = (acc[k] || 0) + n;
    return acc;
  }, {});
  const artifact = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    lang: LANG,
    standard: 'WCAG 2.1 A/AA (axe-core tags wcag2a, wcag2aa, wcag21a, wcag21aa)',
    authenticated: Boolean(auth),
    routesTested: results.length,
    routesClean: results.filter((r) => r.count === 0).length,
    totalsByImpact: totals,
    note: 'Violations are counted per rule per route, not per element. Targets are selectors only — no page text is stored.',
    results,
  };
  const out = path.join(ROOT, 'docs', 'evidence', `a11y-${LANG}.json`);
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`\n  ${artifact.routesClean}/${artifact.routesTested} routes clean · ${Object.entries(totals).map(([k, n]) => `${n} ${k}`).join(', ') || 'no violations'}`);
  console.log(`  written ${path.relative(ROOT, out).replace(/\\/g, '/')}\n`);

  if (FAIL_ON !== 'none') {
    const blocking = (totals[FAIL_ON] || 0);
    if (blocking > 0) {
      console.log(`✗ ${blocking} ${FAIL_ON} violation(s) — failing as requested.\n`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(`a11y sweep failed: ${e.message}`);
  process.exit(1);
});
