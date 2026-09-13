/* Alignment audit v2 — same defect classes as probe-align.cjs, but every finding
   names the offending element (tag, id, classes, a short DOM path) so it can be
   found in code. Also drops the known false-positive sources:

     - <option> / <select> children: native options legitimately share rects
     - elements inside a closed/hidden ancestor

   Usage: node .harness/probe-align2.cjs [route,route,...]
*/
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1366, height: 768 },
];
const ROUTES = [
  '/', '/dashboard', '/decision', '/net-realization',
  '/trade', '/buy', '/market', '/fpo', '/grade-crop', '/weather', '/schemes',
  '/community', '/farms', '/advisory', '/pathways', '/profile', '/settings',
];
// Route selection comes from an env var, not argv: Git Bash on Windows rewrites
// arguments that look like POSIX paths ("/trade" -> "C:/Program Files/Git/trade"),
// which silently dropped routes from a subset run.
const ONLY = process.env.KISAN_ROUTES ? process.env.KISAN_ROUTES.split(',') : null;
const BATCH = process.env.KISAN_BATCH ? Number(process.env.KISAN_BATCH) : null;
const HALF = Math.ceil(ROUTES.length / 2);
const USE = BATCH ? ROUTES.slice((BATCH - 1) * HALF, BATCH * HALF) : ONLY ? ROUTES.filter((r) => ONLY.includes(r)) : ROUTES;
// Devanagari is wider than Latin, so the same layout must be re-checked in the
// other two shipped languages rather than assumed.
const LANG = process.env.KISAN_LANG || 'en';
// Recording mode: always hit the network and persist what comes back.
const WARM = process.env.KISAN_WARM === '1';
const CACHE_FILE = `${process.cwd()}/.harness/api-cache.json`;
const diskCache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const out = { vw, overflowX: de.scrollWidth - de.clientWidth, smallTaps: [], overlap: [], labelRow: [], squeezed: [], spill: [], bigEmpty: [] };

  // An element is "actionable identity" if we can point at it in source.
  const path = (el) => {
    const bits = [];
    let cur = el;
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      let s = cur.tagName.toLowerCase();
      const cls = (cur.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      if (cls.length) s += '.' + cls.slice(0, 3).join('.');
      if (cur.id) s += '#' + cur.id;
      const p = cur.parentElement;
      if (p) {
        const sibs = [...p.children].filter((c) => c.tagName === cur.tagName);
        if (sibs.length > 1) s += ':nth(' + (sibs.indexOf(cur) + 1) + '/' + sibs.length + ')';
      }
      bits.unshift(s);
      cur = cur.parentElement;
    }
    return bits.join('>').slice(0, 120);
  };
  const txt = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const rect = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
  // Attributes are evaluated relative to the page's own paint order, so a
  // native <option> or a select child is never a layout defect.
  const isOptionish = (el) => el.tagName === 'OPTION' || el.tagName === 'OPTGROUP' || el.closest('select');
  // A scrollable ancestor clips its overflow. An element scrolled out of view
  // still reports content coordinates, which would otherwise read as an
  // overlap against whatever is painted there instead.
  const clipped = (el, r) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const oy = cs.overflowY, ox = cs.overflowX;
      if ((oy !== 'visible' || ox !== 'visible') && r.width > 0 && r.height > 0) {
        const pr = p.getBoundingClientRect();
        if (oy !== 'visible' && (r.bottom <= pr.top + 0.5 || r.top >= pr.bottom - 0.5)) return true;
        if (ox !== 'visible' && (r.right <= pr.left + 0.5 || r.left >= pr.right - 0.5)) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const vis = (el, r) => {
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    if (clipped(el, r)) return false;
    return true;
  };
  const inScroller = (el) => !!el.closest('[class*="overflow-x"],[class*="overflow-auto"]');
  // Tailwind's `sr-only` clips its text to 1×1 px so screen readers can still
  // read it. Its scrollWidth therefore dwarfs clientWidth BY DESIGN, which the
  // squeeze test reads as a defect — a false positive. Screen-reader-only text
  // is not laid out for the eye, so it cannot be misaligned for the eye.
  const isSrOnly = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 2 && r.height <= 2) return true;
    return (el.getAttribute('class') || '').includes('sr-only');
  };
  const truncates = (el) => {
    const c = (el.getAttribute('class') || '');
    return c.includes('truncate') || c.includes('line-clamp');
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  // A sticky/fixed element is PAINTED ON TOP of the content it scrolls past —
  // that is what position:sticky means, so comparing it against the content
  // underneath always "overlaps". Genuine sticky-bar breakage is still caught
  // by `spill` (it escapes its container) and `squeezed` (its contents no
  // longer fit), so skipping these pairs loses nothing.
  const inOverlay = (el) => {
    let p = el;
    while (p && p !== document.documentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'sticky' || pos === 'fixed') return true;
      p = p.parentElement;
    }
    return false;
  };
  // Inline text wraps, and a wrapped span's BOUNDING box then covers every line
  // it spans — so a sibling sitting on line 1 "overlaps" a note that runs onto
  // line 2 purely because the boxes nest. Comparing LINE boxes instead only
  // flags glyphs that genuinely collide.
  const lineRects = (el) => {
    const rs = [...el.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
    return rs.length ? rs : [el.getBoundingClientRect()];
  };

  // ── tap targets (all interactive chrome, excluding select internals) ────
  for (const el of document.querySelectorAll('main button, main a, main select, header button, header a, aside button, aside a, [role="button"], button')) {
    if (isOptionish(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 34 && !inScroller(el)) {
      if (out.smallTaps.length < 6) out.smallTaps.push({ h: Math.round(r.height), t: txt(el), p: path(el) });
    }
  }

  // ── overflow / squeeze ─────────────────────────────────────────────────
  for (const el of document.querySelectorAll('main *, header *, footer *, aside *')) {
    if (isOptionish(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 4 && !inScroller(el) && !truncates(el) && !isSrOnly(el)) {
      if (out.spill.length < 6) out.spill.push({ r: rect(r), t: txt(el), p: path(el) });
    }
    if (el.scrollWidth > el.clientWidth + 8 && !inScroller(el) && !truncates(el) && !isSrOnly(el) && el.clientWidth > 0) {
      if (out.squeezed.length < 6) out.squeezed.push({ need: el.scrollWidth, got: el.clientWidth, t: txt(el), p: path(el) });
    }
  }

  // ── real text overlap ──────────────────────────────────────────────────
  const leaves = [];
  for (const el of document.querySelectorAll('main *, header *, footer *, aside *')) {
    if (isOptionish(el)) continue;
    if (!ownText(el)) continue;
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    leaves.push({ el, r, lr: lineRects(el), t: ownText(el).slice(0, 26) });
  }
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (inOverlay(a.el) || inOverlay(b.el)) continue;
      let worst = 0;
      for (const ra of a.lr) {
        for (const rb of b.lr) {
          const area = inter(ra, rb);
          if (area <= 0) continue;
          const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
          if (smaller > 0) worst = Math.max(worst, area / smaller);
        }
      }
      if (worst > 0.35) {
        if (out.overlap.length < 6) out.overlap.push({ a: a.t, b: b.t, pct: Math.round(worst * 100), pa: path(a.el), pb: path(b.el), ra: rect(a.r), rb: rect(b.r) });
      }
    }
  }

  // ── label rows: side-by-side labels IN THE SAME ROW whose tops disagree ─
  // "Same row" means their vertical ranges actually overlap — a 2-column grid
  // legitimately puts row 2's labels ~76px lower, which is not a defect.
  const labels = [...document.querySelectorAll('main label')]
    .map((el) => ({ el, r: el.getBoundingClientRect(), t: (el.innerText || '').trim().slice(0, 24) }))
    .filter((x) => { const r = x.r; return r.width > 0 && r.height > 0 && !clipped(x.el, r); });
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      const vOverlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      const hGap = a.r.right <= b.r.left + 2 || b.r.right <= a.r.left + 2;
      if (!hGap || vOverlap <= 0) continue;
      const dy = Math.abs(a.r.top - b.r.top);
      const similarW = Math.min(a.r.width, b.r.width) / Math.max(a.r.width, b.r.width) > 0.5;
      if (dy > 6 && similarW) {
        if (out.labelRow.length < 6) out.labelRow.push({ a: a.t, b: b.t, dy: Math.round(dy), pa: path(a.el), pb: path(b.el), ya: Math.round(a.r.top), yb: Math.round(b.r.top), ra: rect(a.r), rb: rect(b.r) });
      }
    }
  }

  // ── bigEmpty: content hugging the top with a dead band below ───────────
  for (const el of document.querySelectorAll('main div, main section')) {
    const r = el.getBoundingClientRect();
    if (r.height < 150 || r.width < 140) continue;
    if (truncates(el) || inScroller(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.borderTopWidth === '0px' && cs.boxShadow === 'none') continue;
    if (el.querySelectorAll('*').length < 2) continue;
    let minTop = r.bottom, maxBottom = r.top;
    for (const d of el.querySelectorAll('*')) {
      const dr = d.getBoundingClientRect();
      if (dr.width === 0 || dr.height === 0 || truncates(d)) continue;
      minTop = Math.min(minTop, dr.top);
      maxBottom = Math.max(maxBottom, dr.bottom);
    }
    const deadBottom = r.bottom - maxBottom;
    if (minTop - r.top < 26 && deadBottom > 96 && r.height > 220) {
      if (out.bigEmpty.length < 6) out.bigEmpty.push({ h: Math.round(r.height), dead: Math.round(deadBottom), p: path(el) });
    }
  }

  return out;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    // A warm pass needs a COLD HTTP cache: on a reused profile the server
    // answers 304 Not Modified, the body never arrives, and the endpoint is
    // silently left out of the recording.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + process.cwd() + (WARM ? '/.harness/chrome-profile-warm' : '/.harness/chrome-profile2')],
  });
  const page = await browser.newPage();
  // A sweep makes hundreds of API calls against a 300-per-15-min limiter, so a
  // late combo can render a degraded "unavailable" page whose layout is not the
  // real one. Count 429s per combo so a clean result can be trusted only when it
  // was measured against live data.
  let rate429 = 0;
  page.on('response', (r) => { if (r.status() === 429) rate429++; });

  // The layout of a full-data page is what we are auditing, but the app fires
  // ~69 API calls per 4 page loads and the server caps at 300 per 15 minutes.
  // Without help, late combos render degraded empty states and get scored
  // "clean" against a page nobody ever sees.
  //
  // So every GET /api/* response is captured into a persistent on-disk cache
  // and replayed on later runs: pages still render REAL captured data, but a
  // sweep costs zero API requests. Record with KISAN_WARM=1 (one viewport,
  // records only) over a couple of route batches, then run the real sweep.
  const apiCache = new Map(Object.entries(diskCache));
  const newlyRecorded = {};
  let servedFromCache = 0;
  let liveFetches = 0;
  await page.setRequestInterception(true);
  page.on('response', async (r) => {
    try {
      const req = r.request();
      if (req.method() !== 'GET') return;
      if (!/\/api\//.test(r.url())) return;
      if (r.status() !== 200) return;
      if (apiCache.has(r.url())) return;
      const body = await r.text();
      if (!body) return;
      const rec = { body, contentType: r.headers()['content-type'] || 'application/json' };
      apiCache.set(r.url(), rec);
      newlyRecorded[r.url()] = rec;
    } catch { /* response body unavailable — skip caching this one */ }
  });
  page.on('request', async (req) => {
    const url = req.url();
    // Recording: ask the API directly instead of through the Vite proxy, and
    // address it as 127.0.0.1 rather than the name "localhost".
    //
    // express-rate-limit keys on req.ip, and this machine resolves localhost to
    // IPv6 first: Chrome/Node reach the backend as ::1, while curl (and any
    // explicit 127.0.0.1) arrive as IPv4. Those are SEPARATE buckets, so the
    // browser's can be fully exhausted — every API call a real user makes then
    // returns 429 — while `curl localhost` still cheerfully reports 296 left.
    // Recording through the IPv4 bucket keeps a warm pass honest.
    if (WARM && /localhost:3000\/api\//.test(url)) {
      try {
        const res = await fetch(url.replace('http://localhost:3000', 'http://127.0.0.1:5000'), {
          headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => k.startsWith('author') || k === 'accept')),
        });
        const body = await res.text();
        const contentType = res.headers.get('content-type') || 'application/json';
        if (res.status === 200 && body) {
          const rec = { body, contentType };
          apiCache.set(url, rec);
          newlyRecorded[url] = rec;
        }
        liveFetches++;
        await req.respond({ status: res.status, contentType, body }).catch(() => {});
      } catch {
        req.continue().catch(() => {});
      }
      return;
    }
    const hit = req.method() === 'GET' && apiCache.get(req.url());
    if (hit && !WARM) {
      servedFromCache++;
      req.respond({ status: 200, contentType: hit.contentType, body: hit.body }).catch(() => {});
      return;
    }
    liveFetches++;
    req.continue().catch(() => {});
  });

  const TOKEN = process.env.KISAN_TOKEN;
  const USER = process.env.KISAN_USER || '{}';
  if (!TOKEN) { console.error('KISAN_TOKEN required'); process.exit(1); }
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.evaluate((t, u, l) => {
    localStorage.setItem('kisan360_demo_token', t);
    localStorage.setItem('kisan360_demo_user', u);
    localStorage.setItem('kisan360-lang', l);
  }, TOKEN, USER, LANG);

  const report = [];
  // Recording only needs each endpoint once, and viewport does not change the
  // API URLs — so a warm pass runs a single width to stay under the API cap.
  const USE_VPS = WARM ? [VIEWPORTS[0]] : VIEWPORTS;
  for (const vp of USE_VPS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    for (const route of USE) {
      const entry = { vp: vp.name, route, issues: [], detail: {} };
      rate429 = 0;
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
        await sleep(1800);
        const m = await page.evaluate(MEASURE);
        entry.vw = m.vw;
        for (const [k, label] of [['smallTaps', 'tap'], ['overlap', 'overlap'], ['labelRow', 'labelRow'], ['squeezed', 'squeezed'], ['spill', 'spill'], ['bigEmpty', 'bigEmpty']]) {
          if (m[k].length) entry.issues.push(`${label}:${m[k].length}`);
        }
        entry.detail = m;
        entry.rate429 = rate429;
        if (rate429 > 0) entry.issues.push(`rate429:${rate429}`);
      } catch (e) { entry.issues.push('ERR ' + String(e).slice(0, 70)); }
      if (entry.issues.length) report.push(entry);
      process.stdout.write(`${vp.name} ${route}: ${entry.issues.length ? entry.issues.join(', ') : 'clean'}\n`);
    }
  }
  const outFile = `${process.cwd()}/.harness/align2-report-${LANG}.json`;
  fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
  const layout = report.filter((r) => r.issues.some((i) => !i.startsWith('rate429')));
  const throttled = report.filter((r) => r.issues.every((i) => i.startsWith('rate429')));
  console.log('\n' + (layout.length === 0
    ? `LAYOUT CLEAN (${LANG}) — ${USE.length * USE_VPS.length} combos; throttled-during-measure: ${throttled.length}`
    : `${layout.length} LAYOUT flags (${LANG}) -> ${outFile} (throttled-only: ${throttled.length})`));
  if (WARM) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...diskCache, ...newlyRecorded }, null, 1));
    console.log(`WARM: recorded ${Object.keys(newlyRecorded).length} new endpoints (cache now ${Object.keys({ ...diskCache, ...newlyRecorded }).length})`);
  }
  console.log(`api cache size: ${apiCache.size}; replayed: ${servedFromCache}; live fetches: ${liveFetches}; 429s seen: ${report.reduce((n, r) => n + (r.rate429 || 0), 0)}`);
  await browser.close();
})();
