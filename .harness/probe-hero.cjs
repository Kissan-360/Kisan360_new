/* Hero fold probe — is the landing page's primary CTA visible without
   scrolling, at the widths judges actually use?

   Reports, per viewport: hero height, the top of the primary CTA, and whether
   it falls inside the fold. Also reports the h1's rendered font-size so a
   headline-size regression is obvious. */
const puppeteer = require(process.cwd() + '/.harness/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'lap1024', width: 1024, height: 720 },
  { name: 'lap1152', width: 1152, height: 720 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'lap1366', width: 1366, height: 768 },
  { name: 'lap1440', width: 1440, height: 900 },
  { name: 'desk1920', width: 1920, height: 1080 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--user-data-dir=' + process.cwd() + '/.harness/chrome-profile',
    ],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);

  const rows = [];
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await sleep(500);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const hero = document.querySelector('section');
      // Scope to the hero section — the nav bar also has an "Open the app" button.
      const btns = hero ? [...hero.querySelectorAll('button')] : [];
      const cta = btns.find((b) => /demo|open the app|try/i.test(b.textContent || ''));
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const c = rect(cta);
      return {
        heroH: hero ? Math.round(hero.getBoundingClientRect().height) : null,
        ctaTop: c ? Math.round(c.top) : null,
        ctaBottom: c ? Math.round(c.bottom) : null,
        ctaLabel: cta ? (cta.textContent || '').trim().slice(0, 30) : null,
        h1Size: h1 ? getComputedStyle(h1).fontSize : null,
        h1Lines: h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)) : null,
        innerHeight: window.innerHeight,
      };
    });
    rows.push({ vp: vp.name, ...m, ctaAboveFold: m.ctaBottom !== null && m.ctaBottom <= m.innerHeight });
  }

  console.log(JSON.stringify(rows, null, 1));
  console.log('');
  const bad = rows.filter((r) => !r.ctaAboveFold);
  console.log(
    bad.length === 0
      ? 'CTA ABOVE THE FOLD at every width tested'
      : 'CTA BELOW FOLD at: ' + bad.map((b) => `${b.vp} (ctaBottom=${b.ctaBottom}, vh=${b.innerHeight})`).join(', '),
  );
  await browser.close();
})();
