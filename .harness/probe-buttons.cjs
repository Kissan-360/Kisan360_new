/* Identify the 32px textless buttons on schemes + community */
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

  for (const route of ['/schemes', '/community']) {
    await page.setViewport({ width: 375, height: 667 });
    await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await sleep(1500);
    const found = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main button')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.height < 34) {
          out.push({
            h: Math.round(r.height),
            w: Math.round(r.width),
            cls: (el.className || '').toString().slice(0, 110),
            html: el.innerHTML.slice(0, 80),
            aria: el.getAttribute('aria-label'),
          });
        }
      }
      return out.slice(0, 5);
    });
    console.log('==', route);
    for (const f of found) console.log('  ', JSON.stringify(f));
  }
  await browser.close();
})();
