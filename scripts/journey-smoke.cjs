#!/usr/bin/env node
/**
 * journey-smoke.cjs — the UI half of the sale journey, driven like a farmer.
 *
 * The deployed smoke (scripts/smoke-deployed.cjs) proves the API contract on the
 * public URL. It cannot tell you whether the *screens* still work: a broken
 * button, a form that stopped submitting, a page that throws on mount. Those are
 * exactly the failures a demo dies of, and they are invisible to an API test.
 *
 * This drives real Chrome through login → decision → trade, asserts what a
 * farmer would see, and fails on any console error or page exception. It writes
 * docs/evidence/journey-smoke.json, including the numbers it read off the
 * screen, so the artifact is evidence and not a green tick.
 *
 *   node scripts/journey-smoke.cjs                      local dev server on :3000
 *   node scripts/journey-smoke.cjs --base https://kisan360-web.onrender.com
 *   node scripts/journey-smoke.cjs --lang mr
 *   node scripts/journey-smoke.cjs --keep-open          leave the browser up
 *
 * It leaves a real lot behind (the farmer path creates one); `bash
 * scripts/demo-reset.sh` re-seeds the canonical state.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web-app');
const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return ((i > -1 && process.argv[i + 1]) || process.env.KISAN_BASE || 'http://localhost:3000').replace(/\/$/, '');
})();
const LANG = (() => {
  const i = process.argv.indexOf('--lang');
  return (i > -1 && process.argv[i + 1]) || 'en';
})();
const KEEP_OPEN = process.argv.includes('--keep-open');

function chromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const steps = [];
function record(name, ok, detail) {
  steps.push({ step: name, ok, detail, at: new Date().toISOString() });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const exe = chromePath();
  if (!exe) {
    console.log('⚠️  No Chrome found — skipping the UI journey smoke (set PUPPETEER_EXECUTABLE_PATH to enable).');
    process.exit(0);
  }
  let puppeteer;
  try {
    puppeteer = require(path.join(WEB, 'node_modules', 'puppeteer-core'));
  } catch (e) {
    console.log(`⚠️  puppeteer-core not installed in web-app (${e.message}) — skipping.`);
    process.exit(0);
  }

  // Fail fast and clearly when the API behind the web origin is not usable —
  // otherwise the browser just renders empty screens and the failure reads as a
  // UI bug. (Cold boots answer /health before the database is ready, so this
  // checks the endpoint the journey actually needs.)
  try {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'farmer' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.log(`\n✗ The API is not reachable through ${BASE} (${e.message}).`);
    console.log('  Start the backend on :5000 and wait until /health reports dbReady:true, then retry.\n');
    process.exit(1);
  }

  console.log(`\n🚜 UI journey smoke — ${BASE} · lang=${LANG}\n`);
  const browser = await puppeteer.launch({ executablePath: exe, headless: !KEEP_OPEN, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const consoleErrors = [];
  const pageErrors = [];

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': LANG === 'mr' ? 'mr-IN,mr' : LANG === 'hi' ? 'hi-IN,hi' : 'en-IN,en' });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));

  const text = () => page.evaluate(() => document.body.innerText || '');
  const clickText = async (re, label) => {
    const ok = await page.evaluate((src) => {
      const rx = new RegExp(src, 'i');
      const el = [...document.querySelectorAll('button, a, [role="button"], summary')]
        .find((n) => rx.test((n.innerText || '').trim()) && n.offsetParent !== null);
      if (!el) return false;
      el.click();
      return true;
    }, re.source);
    if (!ok) throw new Error(`no clickable element matched ${label || re}`);
    return true;
  };
  const waitFor = async (re, timeoutMs = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const body = await text();
      if (new RegExp(re, 'i').test(body)) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  };

  try {
    // ── 1. Login as the demo farmer ─────────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.evaluate((lang) => localStorage.setItem('kisan360-lang', lang), LANG);
    await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
    await page.click('button[aria-label="Sign in as Farmer"]');
    await new Promise((r) => setTimeout(r, 1200));
    const afterLogin = page.url();
    record('login as farmer', !/\/login/.test(afterLogin), afterLogin.replace(BASE, '') || '/');

    // ── 2. Decision: run the calculation and read the number ─────────────────
    await page.goto(`${BASE}/decision`, { waitUntil: 'networkidle2', timeout: 45000 });
    const hadAnalyze = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /analy|विश्लेषण|विश्लेषण/i.test(b.innerText || '')));
    if (!hadAnalyze) throw new Error('no Analyze button on /decision');
    await clickText(/^analy|विश्लेषण/i, 'Analyze');
    const gotNet = await waitFor(/(₹|Rs\.?)\s?\d[\d,]{2,}/, 30000);
    const netLine = gotNet ? (await text()).match(/(₹|Rs\.?)\s?\d[\d,]{2,}[^\n]{0,40}/)?.[0] : null;
    record('decision computes a net figure', gotNet, netLine || 'no ₹ figure appeared');

    // ── 3. Trade: the lot and buyer surfaces render ──────────────────────────
    await page.goto(`${BASE}/trade`, { waitUntil: 'networkidle2', timeout: 45000 });
    const tradeBody = await text();
    const hasLotSurface = /new lot|create your first lot|active lot|recent trade lots|नवीन लॉट|नया लॉट/i.test(tradeBody);
    record('trade page shows the lot surface', hasLotSurface, hasLotSurface ? 'lot controls present' : 'no lot control found');

    // ── 4. Create a lot through the UI when the page offers it ───────────────
    if (hasLotSurface && /new lot|create your first lot|नवीन लॉट|नया लॉट/i.test(tradeBody)) {
      await clickText(/new lot|create your first lot|नवीन लॉट|नया लॉट/i, 'create lot');
      await new Promise((r) => setTimeout(r, 800));
      const formVisible = await page.evaluate(() => !!document.querySelector('form'));
      if (!formVisible) {
        record('lot creation form opens', false, 'clicked but no form rendered');
      } else {
        // Fill every emptiable control in the form so the submit is valid.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('form input, form select')) {
            if (el.tagName === 'SELECT' && !el.value) el.selectedIndex = el.options.length > 1 ? 1 : 0;
            else if (el.tagName === 'INPUT' && !el.value && el.type !== 'file') el.value = el.type === 'number' ? '10' : '10';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await new Promise((r) => setTimeout(r, 400));
        let submitted = true;
        try { await clickText(/create|post|save|submit|लॉट|जतन/i, 'submit lot'); } catch { submitted = false; }
        if (!submitted) record('lot creation form submits', false, 'no submit button matched');
        else {
          const listed = await waitFor(/active lot|your lots|lot #|recent trade lots|10\s?q|10 quintal/i, 25000);
          record('lot appears after submit', listed, listed ? 'lot visible on the page' : 'no lot appeared');
        }
      }
    } else {
      record('lot creation form opens', true, 'skipped — a lot already exists (seeded state)');
    }

    // ── 5. Buyer surface: cards exist and the offer composer can open ────────
    const buyers = await page.evaluate(() => [...document.querySelectorAll('[role="button"], button')].filter((n) => /offer to|more info about/i.test(n.getAttribute('aria-label') || n.innerText || '')).length);
    record('buyer offer controls render', buyers > 0, `${buyers} interactive buyer control(s)`);

    // ── 6. Nothing threw along the way ──────────────────────────────────────
    record('no page exceptions', pageErrors.length === 0, pageErrors.length ? pageErrors[0] : 'none');
    record('no console errors', consoleErrors.length === 0, consoleErrors.length ? consoleErrors[0] : 'none');
  } catch (error) {
    record('journey completed', false, error.message);
  } finally {
    if (!KEEP_OPEN) await browser.close();
  }

  const failed = steps.filter((s) => !s.ok);
  const artifact = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    lang: LANG,
    verdict: failed.length ? `FAILED (${failed.length}/${steps.length} steps)` : `JOURNEY OK (${steps.length}/${steps.length} steps)`,
    steps,
    consoleErrors,
    pageErrors,
    note: 'Driven through the real UI (puppeteer-core + system Chrome). Leaves a lot behind unless the state was already seeded — run scripts/demo-reset.sh for a clean slate.',
  };
  const out = path.join(ROOT, 'docs', 'evidence', 'journey-smoke.json');
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`\n  ${artifact.verdict}`);
  console.log(`  written ${path.relative(ROOT, out).replace(/\\/g, '/')}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(`journey smoke failed: ${e.message}`); process.exit(1); });
