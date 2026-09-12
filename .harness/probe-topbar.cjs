/* Topbar band probe — loads /dashboard at laptop-band widths and checks for
   pairwise overlaps between header interactive elements (the defect class from
   the user's screenshot: search text under the language chip). */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const EDGE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const WIDTHS = [1024, 1067, 1152, 1280, 1366];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const TOKEN = process.env.KISAN_TOKEN;
  if (!TOKEN) { console.error('KISAN_TOKEN env required'); process.exit(1); }
  const USER = process.env.KISAN_USER || '{}';
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile'],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate((t, u) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', u);
  }, TOKEN, USER);

  const findings = [];
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 720 });
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await sleep(1200);
    const res = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return { err: 'no header' };
      const els = [...header.querySelectorAll('button, a, span')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Only leaf-ish visible chrome: skip containers that fully wrap others
        return true;
      });
      const rects = els.map((el) => ({
        tag: el.tagName,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 28),
        cls: (el.className || '').toString().slice(0, 40),
        r: el.getBoundingClientRect(),
      }));
      const overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r, b = rects[j].r;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 4 && oy > 4) {
            // Ignore strict containment (icon inside button etc.)
            const aInB = a.left >= b.left - 2 && a.right <= b.right + 2 && a.top >= b.top - 2 && a.bottom <= b.bottom + 2;
            const bInA = b.left >= a.left - 2 && b.right <= a.right + 2 && b.top >= a.top - 2 && b.bottom <= a.bottom + 2;
            if (aInB || bInA) continue;
            overlaps.push({ a: `${rects[i].tag}"${rects[i].text}"`, b: `${rects[j].tag}"${rects[j].text}"`, ox: Math.round(ox), oy: Math.round(oy) });
          }
        }
      }
      const search = rects.find((x) => x.text.includes('Search'));
      const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return {
        vw: document.documentElement.clientWidth,
        overlaps: overlaps.slice(0, 6),
        searchVisible: !!search,
        searchRight: search ? Math.round(search.r.right) : null,
        overflowX,
        headerChildren: rects.filter((x) => x.tag !== 'SPAN' || (x.text && x.text.length < 40)).map((x) => `${x.tag}:${x.text.slice(0, 18) || x.cls.slice(0, 14)}`),
      };
    });
    if (res.overlaps?.length || res.overflowX > 2) {
      findings.push({ width: w, ...res });
    } else {
      console.log(`${w}px: clean (search visible=${res.searchVisible}, header=[${(res.headerChildren || []).join(' | ')}])`);
    }
  }
  await browser.close();
  console.log(findings.length ? 'FINDINGS:\n' + JSON.stringify(findings, null, 1) : 'BAND CLEAN — no overlaps at any width');
})();
