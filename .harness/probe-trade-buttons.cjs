/* Locate the remaining 30px textless buttons on /trade with parent context */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', u);
  }, process.env.KISAN_TOKEN, process.env.KISAN_USER || '{}');

  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/trade', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(1800);
  const found = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('main button')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 32) {
        let section = el.closest('[aria-label], section, .card');
        out.push({
          h: Math.round(r.height),
          w: Math.round(r.width),
          cls: (el.className || '').toString().slice(0, 90),
          svg: (el.querySelector('svg') || {}).outerHTML?.slice(8, 60) || '',
          parentText: (section?.getAttribute?.('aria-label') || section?.innerText || '').slice(0, 50).replace(/\n/g, ' | '),
        });
      }
    }
    return out.slice(0, 8);
  });
  console.log(JSON.stringify(found, null, 1));
  await browser.close();
})();
