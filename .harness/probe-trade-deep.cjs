/* Final trace: leaf-level squeeze on /trade at 375px */
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

  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3000/trade', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await sleep(1800);
  const leaves = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('main *')) {
      if (el.scrollWidth <= el.clientWidth + 8 || el.clientWidth === 0) continue;
      const kidOver = [...el.children].some((k) => k.scrollWidth > k.clientWidth + 8);
      if (kidOver) continue;
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 100),
        sw: el.scrollWidth,
        cw: el.clientWidth,
        text: (el.innerText || '').slice(0, 70).replace(/\n/g, ' | '),
      });
    }
    return out.slice(0, 10);
  });
  console.log(JSON.stringify(leaves, null, 1));
  await browser.close();
})();
