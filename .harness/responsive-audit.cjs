/* Responsive audit harness — renders routes at 7 viewports (full band:
   mobile 375 / tablet 768 / laptop band 1024-1440) in headless Chrome.
   Reports per combo: horizontal overflow, spill offenders, squeezed elements,
   undersized tap targets, raw i18n keys. Saves a screenshot per combo.
   Optional: KISAN_LANG=mr|hi seeds the language before rendering (Phase 3). */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const fs = require('fs');

const EDGE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'lap1024', width: 1024, height: 720 },
  { name: 'lap1152', width: 1152, height: 720 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'lap1366', width: 1366, height: 768 },
  { name: 'lap1440', width: 1440, height: 900 },
];
const ROUTES = [
  '/dashboard',
  '/net-realization?crop=Onion&district=Nagpur&quantity=10',
  '/decision?crop=Onion&district=Nagpur&quantity=10',
  '/trade',
  '/market',
  '/fpo',
  '/grade-crop',
  '/weather',
  '/schemes',
  '/community',
  '/lots',
  '/selling-guide',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile', '--window-size=1400,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // ── Auth: token provided via env (avoids the per-IP demo-login limiter) ──
  const TOKEN = process.env.KISAN_TOKEN;
  const USER = process.env.KISAN_USER || '{}';
  if (!TOKEN) { console.error('KISAN_TOKEN env required'); process.exit(1); }
  const LANG = process.env.KISAN_LANG || '';
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate((t, u, lang) => {
      localStorage.setItem('kisan360_demo_token', t);
      localStorage.setItem('kisan360_demo_user', u);
      if (lang) localStorage.setItem('kisan360-lang', lang);
    }, TOKEN, USER, LANG);
    console.log('auth seeded, len', TOKEN.length, LANG ? 'lang=' + LANG : '');
  } catch (e) { console.error('seed issue:', String(e).slice(0, 100)); }

  fs.mkdirSync(process.cwd() + '/.harness/shots', { recursive: true });
  const report = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      const entry = { vp: vp.name, route, issues: [] };
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        await sleep(1400);

        const m = await page.evaluate(() => {
          const de = document.documentElement;
          const vw = de.clientWidth;
          const res = { vw, overflowX: de.scrollWidth - de.clientWidth, spill: [], squeezed: [], smallTaps: [], rawKeys: [] };
          const inScroller = (el) => !!el.closest('[class*="overflow-x"],[class*="overflow-auto"]');
          const truncates = (el) => {
            const c = (el.className || '').toString();
            return c.includes('truncate') || c.includes('overflow-hidden') || c.includes('line-clamp');
          };
          for (const el of document.querySelectorAll('main *, header *, footer *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.right > vw + 4 && !inScroller(el) && !truncates(el)) {
              if (res.spill.length < 5) res.spill.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0, 60), right: Math.round(r.right) });
            }
            if (el.scrollWidth > el.clientWidth + 8 && !inScroller(el) && !truncates(el) && el.clientWidth > 0) {
              if (res.squeezed.length < 5) res.squeezed.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0, 60) });
            }
          }
          for (const el of document.querySelectorAll('main button, main a, main select')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.height < 34 && !inScroller(el)) {
              if (res.smallTaps.length < 5) res.smallTaps.push({ tag: el.tagName, h: Math.round(r.height), text: (el.innerText || '').slice(0, 25) });
            }
          }
          const keyRe = /\b(?:nav|dashboard|topbar|market|trade|fpo|grade|weather|scheme|community|lots|guide|pathway|profile|settings|farm|disease|flow|common|chat|auth|landing|net|decision)\.[a-z][a-zA-Z.]{3,40}\b/g;
          const raw = document.body.innerText.match(keyRe);
          if (raw) res.rawKeys = [...new Set(raw)].slice(0, 4);
          return res;
        });

        entry.vw = m.vw;
        if (m.overflowX > 2) entry.issues.push(`overflowX ${m.overflowX}px`);
        if (m.spill.length) entry.issues.push(`spill:${m.spill.length}`);
        if (m.squeezed.length) entry.issues.push(`squeezed:${m.squeezed.length}`);
        if (m.smallTaps.length) entry.issues.push(`smallTaps:${m.smallTaps.length}`);
        if (m.rawKeys.length) entry.issues.push(`rawKeys:${m.rawKeys.join(',')}`);
        entry.detail = { spill: m.spill, squeezed: m.squeezed, smallTaps: m.smallTaps, rawKeys: m.rawKeys };

        const slug = route.split('?')[0].replace(/\//g, '_') || 'root';
        await page.screenshot({ path: `${process.cwd()}/.harness/shots/${vp.name}${slug}.png` });
      } catch (e) {
        entry.issues.push('ERR ' + String(e).slice(0, 80));
      }
      if (entry.issues.length) report.push(entry);
    }
  }

  await browser.close();
  if (report.length === 0) {
    console.log(`ALL CLEAN — ${VIEWPORTS.length * ROUTES.length} combos (${VIEWPORTS.length} viewports x ${ROUTES.length} routes${LANG ? ', lang=' + LANG : ''}), no overflow/spill/squeeze/tap/key issues`);
  } else {
    console.log(JSON.stringify(report, null, 1));
  }
})();
