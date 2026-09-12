/* Focused re-check: two flagged combos, 3.5s settle, leaf-offender dump.
   Distinguishes real overflow (persistent at settle) from mid-load sampling. */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const EDGE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const CASES = [
  { vp: { width: 375, height: 667 }, route: '/trade' },
  { vp: { width: 1024, height: 720 }, route: '/net-realization?crop=Onion&district=Nagpur&quantity=10' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const TOKEN = process.env.KISAN_TOKEN;
  if (!TOKEN) { console.error('KISAN_TOKEN env required'); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile'],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
  const LANG = process.env.KISAN_LANG || '';
  await page.evaluate((t, lang) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', JSON.stringify({ uid: 'demo-farmer', role: 'farmer', name: 'Ramesh Patil', district: 'Pune' }));
    if (lang) localStorage.setItem('kisan360-lang', lang);
  }, TOKEN, LANG);

  for (const c of CASES) {
    await page.setViewport(c.vp);
    await page.goto(BASE + c.route, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await sleep(3500); // full settle — all API renders done
    const res = await page.evaluate(() => {
      const out = [];
      const inScroller = (el) => !!el.closest('[class*="overflow-x"],[class*="overflow-auto"]');
      const truncates = (el) => { const c = (el.className || '').toString(); return c.includes('truncate') || c.includes('overflow-hidden') || c.includes('line-clamp'); };
      for (const el of document.querySelectorAll('main *, header *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || inScroller(el) || truncates(el)) continue;
        if (el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 0) {
          // leaf check: does any child also overflow? if so it's a container
          const childOverflows = [...el.children].some((ch) => ch.scrollWidth > ch.clientWidth + 8);
          out.push({
            tag: el.tagName, cls: (el.className || '').toString().slice(0, 50),
            leaf: !childOverflows,
            scrollW: el.scrollWidth, clientW: el.clientWidth,
            text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
          });
        }
      }
      return out.slice(0, 8);
    });
    console.log(`${c.vp.width}px ${c.route.split('?')[0]}: ${res.length === 0 ? 'CLEAN at settle' : JSON.stringify(res, null, 1)}`);
  }
  await browser.close();
})();
