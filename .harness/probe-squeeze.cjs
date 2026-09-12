/* Leaf-offender probe: find the deepest elements whose content exceeds their box. */
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

  const cases = [
    { vp: { width: 375, height: 667 }, route: '/trade' },
    { vp: { width: 768, height: 1024 }, route: '/net-realization?crop=Onion&district=Nagpur&quantity=10' },
    { vp: { width: 768, height: 1024 }, route: '/schemes' },
  ];
  for (const c of cases) {
    await page.setViewport({ width: c.vp.width, height: c.vp.height });
    await page.goto('http://localhost:3000' + c.route, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await sleep(1500);
    const leaves = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (el.scrollWidth <= el.clientWidth + 8) continue;
        // leaf: no child also overflowing
        const kidOver = [...el.children].some((k) => k.scrollWidth > k.clientWidth + 8);
        if (kidOver) continue;
        out.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 90),
          sw: el.scrollWidth,
          cw: el.clientWidth,
          text: (el.innerText || '').slice(0, 60).replace(/\n/g, ' | '),
        });
      }
      return out.slice(0, 8);
    });
    console.log('==', c.vp.width, c.route.split('?')[0]);
    for (const l of leaves) console.log('  ', JSON.stringify(l));
  }
  await browser.close();
})();
