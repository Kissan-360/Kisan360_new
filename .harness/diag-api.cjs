/* Diagnostic: which API URLs does the app actually request, and how often?
   Usage: KISAN_TOKEN=... node .harness/diag-api.cjs
*/
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const ROUTES = ['/dashboard', '/trade', '/market', '/decision'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile-diag'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  const counts = new Map();
  const statuses = new Map();
  page.on('request', (req) => {
    const u = req.url();
    if (!/\/api\//.test(u)) return;
    const key = req.method() + ' ' + u.replace(BASE, '');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!/\/api\//.test(u)) return;
    const key = r.status() + ' ' + r.request().method() + ' ' + u.replace(BASE, '');
    statuses.set(key, (statuses.get(key) || 0) + 1);
  });

  const TOKEN = process.env.KISAN_TOKEN;
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.evaluate((t) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', JSON.stringify({ id: 'demo-farmer', displayName: 'Demo Farmer', role: 'farmer', district: 'Pune' }));
    localStorage.setItem('kisan360-lang', 'en');
  }, TOKEN);

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await sleep(2000);
  }

  console.log('=== REQUEST COUNTS (what the app asks for) ===');
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(3) + 'x  ' + k));
  console.log('\n=== RESPONSE STATUSES ===');
  [...statuses.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(3) + 'x  ' + k));
  console.log('\ntotal api requests: ' + [...counts.values()].reduce((a, b) => a + b, 0) + ' over ' + ROUTES.length + ' route loads');
  await browser.close();
})();
