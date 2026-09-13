/* Landing-page responsive check — the full audit harness sweeps 13 routes and
   takes minutes; this sweeps only `/`, across the same 7 viewports, in all
   three languages. Reuses the audit's exact heuristics so results are directly
   comparable.

   Usage: node .harness/probe-landing.cjs            (en, mr, hi)
          LANG_ONLY=hi node .harness/probe-landing.cjs */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
const LANGS = process.env.LANG_ONLY ? [process.env.LANG_ONLY] : ['en', 'mr', 'hi'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Verbatim from responsive-audit.cjs so the two agree on what "broken" means. */
const MEASURE = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const res = { vw, overflowX: de.scrollWidth - de.clientWidth, spill: [], squeezed: [], smallTaps: [], rawKeys: [], overlaps: [] };
  const ixn = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (const badge of document.querySelectorAll('main .badge, header .badge')) {
    const br = badge.getBoundingClientRect();
    if (br.width === 0) continue;
    const card = badge.closest('[class*="card"], [class*="rounded"]') || badge.parentElement;
    if (!card) continue;
    for (const el of card.querySelectorAll('p, span, div, h1, h2, h3, li')) {
      if (badge.contains(el) || el.contains(badge) || !(el.innerText || '').trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (ixn(br, r) > 120) {
        if (res.overlaps.length < 5) res.overlaps.push({ badge: (badge.innerText || '').slice(0, 20), vs: el.tagName });
        break;
      }
    }
  }
  const inScroller = (el) => !!el.closest('[class*="overflow-x"],[class*="overflow-auto"]');
  const truncates = (el) => {
    const c = (el.className || '').toString();
    return c.includes('truncate') || c.includes('overflow-hidden') || c.includes('line-clamp');
  };
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 4 && !inScroller(el) && !truncates(el)) {
      if (res.spill.length < 5) res.spill.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 70), right: Math.round(r.right) });
    }
    if (el.scrollWidth > el.clientWidth + 8 && !inScroller(el) && !truncates(el) && el.clientWidth > 0) {
      if (res.squeezed.length < 5) res.squeezed.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 70) });
    }
  }
  for (const el of document.querySelectorAll('main button, main a, main select, header button, header a, footer a')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 34 && !inScroller(el)) {
      if (res.smallTaps.length < 5) res.smallTaps.push({ tag: el.tagName, h: Math.round(r.height), text: (el.innerText || '').slice(0, 25) });
    }
  }
  const keyRe = /\b(?:nav|common|landing|calc)\.[a-z][a-zA-Z.]{3,40}\b/g;
  const raw = document.body.innerText.match(keyRe);
  if (raw) res.rawKeys = [...new Set(raw)].slice(0, 4);
  return res;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile'],
  });
  const page = await browser.newPage();
  const report = [];

  for (const lang of LANGS) {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.evaluate((l) => localStorage.setItem('kisan360-lang', l), lang);

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await sleep(1200);
      const m = await page.evaluate(MEASURE);
      const issues = [];
      if (m.overflowX > 2) issues.push(`overflowX ${m.overflowX}px`);
      if (m.spill.length) issues.push(`spill:${m.spill.length}`);
      if (m.squeezed.length) issues.push(`squeezed:${m.squeezed.length}`);
      if (m.smallTaps.length) issues.push(`smallTaps:${m.smallTaps.length}`);
      if (m.rawKeys.length) issues.push(`rawKeys:${m.rawKeys.join(',')}`);
      if (m.overlaps.length) issues.push(`overlaps:${m.overlaps.length}`);
      if (issues.length) report.push({ lang, vp: vp.name, vw: m.vw, issues, detail: { spill: m.spill, squeezed: m.squeezed, smallTaps: m.smallTaps, rawKeys: m.rawKeys } });
      process.stdout.write(`  ${lang} ${vp.name}: ${issues.length ? issues.join(', ') : 'clean'}\n`);
    }
  }

  console.log('');
  console.log(report.length === 0
    ? `LANDING CLEAN — ${LANGS.length * VIEWPORTS.length} combos (${VIEWPORTS.length} viewports x ${LANGS.length} languages)`
    : `${report.length} flagged combos:\n` + JSON.stringify(report, null, 1));
  await browser.close();
})();
