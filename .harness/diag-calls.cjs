/* Counts API requests per route, to quantify over-fetching.
 *
 * React StrictMode double-invokes effects in dev, so a baseline of 2 per
 * endpoint is expected and harmless. Anything noticeably above that is either a
 * genuine effect loop or several independent callers for the same data — and it
 * is exactly what made the old 300/15min rate limiter trip during ordinary use.
 *
 * Usage: node .harness/diag-calls.cjs [route ...]
 */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const API_DIRECT = 'http://127.0.0.1:5000';
const ROUTES = process.argv.slice(2).filter((a) => a.startsWith('/'));
const USE = ROUTES.length ? ROUTES : ['/dashboard', '/trade', '/fpo', '/decision', '/net-realization'];

async function login(role) {
  const res = await fetch(`${API_DIRECT}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

(async () => {
  const { token, user } = await login('farmer');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: process.cwd() + '/.harness/chrome-profile-calls',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((t, u) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', u);
  }, token, JSON.stringify(user));

  for (const route of USE) {
    /** @type {Record<string, number>} */
    const counts = {};
    const handler = (r) => {
      const url = r.url();
      if (!/\/api\//.test(url)) return;
      // Keep the query string: /api/x?crop=A and /api/x?crop=B are genuinely
      // different data, and merging them makes one shared request look like
      // duplication. The `dir` marker still separates the two route labels.
      const key = `${r.request().method()} ${url.replace(BASE, '')}`;
      counts[key] = (counts[key] || 0) + 1;
    };
    page.on('response', handler);
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    page.off('response', handler);

    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, [, n]) => s + n, 0);
    const dupes = rows.filter(([, n]) => n > 2);
    console.log(`\n=== ${route}  — ${total} API calls, ${rows.length} distinct`);
    rows.forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}x  ${k}${n > 2 ? '   <-- over 2' : ''}`));
    if (dupes.length) {
      const wasted = dupes.reduce((s, [, n]) => s + n - 2, 0);
      console.log(`  OVER-FETCH: ${wasted} avoidable calls (${dupes.length} endpoints above the StrictMode baseline of 2)`);
    }
  }

  await browser.close();
})().catch((e) => { console.error('diag failed:', e); process.exit(1); });
