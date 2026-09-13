/* Alignment audit — sweeps every route at three widths and reports the classes
   of layout defect that "does this look finished?" actually means:

     overlap    two text-bearing elements genuinely collide
     labelRow   side-by-side field labels whose tops disagree (the classic
                "one label sits higher because its column is taller")
     raggedRow  sibling cards in one row whose CONTENT bottoms disagree, i.e.
                equal-height boxes with visibly uneven insides
     bigEmpty   a card whose content hugs the top, leaving a large dead band
                at the bottom
     plus the standing overflow / spill / squeeze / tap / raw-key checks.

   Noise control: overlaps must be real (>35% of the smaller box), label rows
   must be horizontally disjoint with similar widths, and ragged rows need a
   spread large enough to be visible. Screenshots are saved for every route so
   each finding can be confirmed by eye before anything is changed.

   Usage: node .harness/probe-align.cjs [route]
*/
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
];
const ROUTES = [
  '/', '/login', '/register', '/dashboard', '/decision', '/net-realization',
  '/trade', '/market', '/fpo', '/grade-crop', '/weather', '/schemes',
  '/community', '/farms', '/advisory', '/pathways', '/profile', '/settings',
];
const ONLY = process.argv[2];
const USE = ONLY ? ROUTES.filter((r) => r === ONLY) : ROUTES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const out = { vw, overflowX: de.scrollWidth - de.clientWidth, spill: [], squeezed: [], smallTaps: [], rawKeys: [], overlap: [], labelRow: [], raggedRow: [], bigEmpty: [] };

  const vis = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  const inScroller = (el) => !!el.closest('[class*="overflow-x"],[class*="overflow-auto"]');
  const truncates = (el) => {
    const c = (el.className || '').toString();
    return c.includes('truncate') || c.includes('overflow-hidden') || c.includes('line-clamp');
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const label = (el) => el.tagName + '.' + (el.className || '').toString().split(' ').slice(0, 2).join('.');

  // ── spill / squeeze ────────────────────────────────────────────────────
  for (const el of document.querySelectorAll('main *, header *, footer *, aside *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 4 && !inScroller(el) && !truncates(el)) {
      if (out.spill.length < 4) out.spill.push({ ...{ tag: el.tagName, cls: label(el).slice(0, 60) }, right: Math.round(r.right) });
    }
    if (el.scrollWidth > el.clientWidth + 8 && !inScroller(el) && !truncates(el) && el.clientWidth > 0) {
      if (out.squeezed.length < 4) out.squeezed.push({ tag: el.tagName, cls: label(el).slice(0, 60) });
    }
  }

  // ── tap targets ────────────────────────────────────────────────────────
  for (const el of document.querySelectorAll('main button, main a, main select, header button, header a, aside button, aside a')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 34 && !inScroller(el)) {
      if (out.smallTaps.length < 4) out.smallTaps.push({ h: Math.round(r.height), text: (el.innerText || '').slice(0, 24) });
    }
  }

  // ── raw i18n keys ──────────────────────────────────────────────────────
  const keyRe = /\b(?:nav|dashboard|topbar|market|trade|fpo|grade|weather|scheme|community|lots|guide|pathway|profile|settings|farm|disease|flow|common|chat|auth|landing|net|decision|calc|who|risk)\.[a-z][a-zA-Z.]{3,40}\b/g;
  const raw = document.body.innerText.match(keyRe);
  if (raw) out.rawKeys = [...new Set(raw)].slice(0, 4);

  // ── real text overlap ──────────────────────────────────────────────────
  const leaves = [];
  for (const el of document.querySelectorAll('main *, header *, footer *, aside *')) {
    if (!ownText(el)) continue;
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    leaves.push({ el, r, txt: ownText(el).slice(0, 28), d: 0 });
  }
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const area = inter(a.r, b.r);
      if (area <= 0) continue;
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (smaller > 0 && area / smaller > 0.35) {
        if (out.overlap.length < 5) out.overlap.push({ a: a.txt, b: b.txt, pct: Math.round((area / smaller) * 100) });
      }
    }
  }

  // ── label rows: side-by-side <label>s whose tops disagree ──────────────
  const labels = [...document.querySelectorAll('main label')]
    .map((el) => ({ el, r: el.getBoundingClientRect(), t: (el.innerText || '').trim().slice(0, 20) }))
    .filter((x) => x.r.width > 0 && x.r.height > 0);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      // horizontally disjoint (side by side) but vertically adjacent
      if (a.r.right <= b.r.left + 2 || b.r.right <= a.r.left + 2) {
        const dy = Math.abs(a.r.top - b.r.top);
        const dyBot = Math.abs(a.r.bottom - b.r.bottom);
        const similarW = Math.min(a.r.width, b.r.width) / Math.max(a.r.width, b.r.width) > 0.5;
        if (dy > 6 && dyBot > 6 && similarW && Math.abs(a.r.top - b.r.top) < 400) {
          if (out.labelRow.length < 5) out.labelRow.push({ a: a.t, b: b.t, dy: Math.round(dy) });
        }
      }
    }
  }

  // ── ragged rows: sibling cards whose content bottoms disagree ──────────
  const gridish = [...document.querySelectorAll('main div, main section')].filter((p) => {
    const s = getComputedStyle(p);
    return (s.display === 'grid' || (s.display === 'flex' && s.flexDirection === 'row')) && p.children.length >= 2;
  });
  for (const p of gridish) {
    const kids = [...p.children].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cardy = cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none' || (el.className || '').toString().includes('rounded');
      let contentBottom = r.top;
      for (const d of el.querySelectorAll('*')) {
        const dr = d.getBoundingClientRect();
        if (dr.width === 0 || dr.height === 0) continue;
        if (truncates(d)) continue;
        contentBottom = Math.max(contentBottom, dr.bottom);
      }
      return { r, cardy, contentBottom, name: label(el).slice(0, 44) };
    }).filter((k) => k.r.width > 0 && k.r.height > 40);
    if (kids.length < 2) continue;
    // same visual row only
    const rowTop = Math.min(...kids.map((k) => k.r.top));
    const row = kids.filter((k) => Math.abs(k.r.top - rowTop) < 24);
    if (row.length < 2 || !row.every((k) => k.cardy)) continue;
    const bottoms = row.map((k) => k.contentBottom);
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    if (spread > 56 && out.raggedRow.length < 4) {
      out.raggedRow.push({ parent: label(p).slice(0, 44), spread: Math.round(spread), kids: row.map((k) => k.name) });
    }
  }

  // ── bigEmpty: card content hugging the top with a dead band below ─────
  for (const el of document.querySelectorAll('main div, main section')) {
    const r = el.getBoundingClientRect();
    if (r.height < 150 || r.width < 140) continue;
    if (truncates(el) || inScroller(el)) continue;
    const cs = getComputedStyle(el);
    const cardy = cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
    if (!cardy) continue;
    if (el.querySelectorAll('*').length < 2) continue;
    let minTop = r.bottom, maxBottom = r.top;
    for (const d of el.querySelectorAll('*')) {
      const dr = d.getBoundingClientRect();
      if (dr.width === 0 || dr.height === 0 || truncates(d)) continue;
      minTop = Math.min(minTop, dr.top);
      maxBottom = Math.max(maxBottom, dr.bottom);
    }
    const deadBottom = r.bottom - maxBottom;
    const topHug = minTop - r.top;
    // only when content is anchored near the top and the band below is large
    if (topHug < 26 && deadBottom > 96 && r.height > 220) {
      if (out.bigEmpty.length < 4) out.bigEmpty.push({ cls: label(el).slice(0, 46), h: Math.round(r.height), dead: Math.round(deadBottom) });
    }
  }

  return out;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile'],
  });
  const page = await browser.newPage();
  const TOKEN = process.env.KISAN_TOKEN;
  const USER = process.env.KISAN_USER || '{}';
  if (!TOKEN) { console.error('KISAN_TOKEN required'); process.exit(1); }
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.evaluate((t, u) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', u);
    localStorage.setItem('kisan360-lang', 'en');
  }, TOKEN, USER);

  fs.mkdirSync(process.cwd() + '/.harness/shots', { recursive: true });
  const report = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    for (const route of USE) {
      const entry = { vp: vp.name, route, issues: [] };
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
        await sleep(1600);
        const m = await page.evaluate(MEASURE);
        entry.vw = m.vw;
        if (m.overflowX > 2) entry.issues.push(`overflowX ${m.overflowX}px`);
        if (m.spill.length) entry.issues.push(`spill:${m.spill.length}`);
        if (m.squeezed.length) entry.issues.push(`squeezed:${m.squeezed.length}`);
        if (m.smallTaps.length) entry.issues.push(`smallTaps:${m.smallTaps.length}`);
        if (m.rawKeys.length) entry.issues.push(`rawKeys:${m.rawKeys.join(',')}`);
        if (m.overlap.length) entry.issues.push(`overlap:${m.overlap.length}`);
        if (m.labelRow.length) entry.issues.push(`labelRow:${m.labelRow.length}`);
        if (m.raggedRow.length) entry.issues.push(`raggedRow:${m.raggedRow.length}`);
        if (m.bigEmpty.length) entry.issues.push(`bigEmpty:${m.bigEmpty.length}`);
        entry.detail = {
          spill: m.spill, squeezed: m.squeezed, smallTaps: m.smallTaps, rawKeys: m.rawKeys,
          overlap: m.overlap, labelRow: m.labelRow, raggedRow: m.raggedRow, bigEmpty: m.bigEmpty,
        };
        const slug = route.replace(/\//g, '_') || 'root';
        await page.screenshot({ path: `${process.cwd()}/.harness/shots/align-${vp.name}${slug}.png` });
      } catch (e) {
        entry.issues.push('ERR ' + String(e).slice(0, 70));
      }
      if (entry.issues.length) report.push(entry);
      process.stdout.write(`${vp.name} ${route}: ${entry.issues.length ? entry.issues.join(', ') : 'clean'}\n`);
    }
  }

  fs.writeFileSync(process.cwd() + '/.harness/align-report.json', JSON.stringify(report, null, 1));
  console.log('');
  console.log(report.length === 0
    ? `ALL CLEAN — ${USE.length * VIEWPORTS.length} combos`
    : `${report.length} flagged combos written to .harness/align-report.json`);
  await browser.close();
})();
