/* How many API calls does ONE page load actually make? Cold profile, one route.
   Usage: KISAN_TOKEN=... KISAN_ROUTE=/trade node .harness/diag-one.cjs
*/
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const ROUTE = process.env.KISAN_ROUTE || '/trade';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile-one'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });

  const urls = [];
  const byStatus = {};
  page.on('request', (req) => { if (/\/api\//.test(req.url())) urls.push(req.method() + ' ' + req.url().replace(BASE, '')); });
  page.on('response', (r) => { if (/\/api\//.test(r.url())) byStatus[r.status()] = (byStatus[r.status()] || 0) + 1; });

  const TOKEN = process.env.KISAN_TOKEN;
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.evaluate((t) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', JSON.stringify({ id: 'demo-farmer', displayName: 'Demo Farmer', role: 'farmer', district: 'Pune' }));
    localStorage.setItem('kisan360-lang', 'en');
  }, TOKEN);

  urls.length = 0;
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  await sleep(3000);

  const counts = {};
  for (const u of urls) counts[u] = (counts[u] || 0) + 1;
  const uniq = Object.keys(counts);
  console.log(`route ${ROUTE}: ${urls.length} API requests, ${uniq.length} distinct`);
  console.log('statuses:', JSON.stringify(byStatus));
  console.log('--- most repeated ---');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, n]) => console.log(`  ${n}x  ${k}`));
  await browser.close();
})();
