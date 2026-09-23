#!/usr/bin/env node
/**
 * evidence.cjs — the doc numbers, regenerated from the artifacts on disk.
 *
 * The problem this exists for: the judge-facing docs had drifted from the
 * machine. They advertised a 250-row snapshot while disk held 388, described an
 * 85-row fallback, counted 607/636 tests while the suite ran 638, and dated the
 * AGMARKNET pull to 2026-09-11 while `retrievedAt` said 2026-09-23. None of it
 * was a lie when written; all of it was unverifiable, which is how a project
 * loses an argument it should win. Numbers in prose are claims, and a claim
 * nobody regenerates is a claim waiting to be wrong.
 *
 * So: every number a doc may state is derived here from the file that actually
 * holds it, the derivation is written to docs/evidence/facts.json, and
 * `--check` fails when a doc disagrees. CI runs --check, so drift now breaks the
 * build instead of surfacing in front of a judge.
 *
 *   node scripts/evidence.cjs                     print facts, write facts.json, list drift
 *   node scripts/evidence.cjs --check             fail on any doc/artifact disagreement
 *   node scripts/evidence.cjs --write             rewrite flagged numbers (dry run unless --yes)
 *   node scripts/evidence.cjs --record-tests FILE reduce a jest --json report to test-count.json
 *
 * --write exists because the numbers legitimately move: the nightly AGMARKNET
 * refresh changes rows, markets and crops, and a gate that turns red every night
 * for a mechanical reason trains people to ignore it. The refresh workflow runs
 * --write, so the docs stay true without anyone remembering — and every change
 * lands in the bot's diff, where it is visible.
 *
 * A line may opt out of a check with an `evidence-ok` comment when the number it
 * states is deliberately historical (e.g. quoting an old pull while explaining a
 * fallback). That is visible in review, which is the point.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const abs = (p) => path.join(ROOT, p);
const readJson = (p) => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const has = (p) => fs.existsSync(abs(p));

// ── FACTS ────────────────────────────────────────────────────────────────────
// Each value is read from the artifact that owns it. Nothing is passed in.

// Crops the docs quote per-crop slices for. A slice number is a different
// quantity from the snapshot total — "Onion ≈ 49 rows / 43 markets" is not a
// wrong version of "388 rows" — so the checker has to know both.
const SLICE_CROPS = ['onion', 'soybean', 'soyabean', 'tomato', 'cotton', 'paddy', 'grape'];

function marketFacts() {
  const snap = readJson('backend/src/data/priceSnapshots.json');
  const meta = snap.meta || snap._meta || {};
  const rows = Array.isArray(snap.rows) ? snap.rows : [];
  const uniq = (key) => new Set(rows.map((r) => r[key]).filter(Boolean)).size;
  const { parseObservedDate, ageMs } = require(abs('backend/src/lib/observedDate'));

  let newest = null;
  let newestMs = -Infinity;
  for (const row of rows) {
    const d = parseObservedDate(row.arrivalDate || row.observedOn);
    if (!d) continue;
    const ms = d.getTime();
    if (ms > newestMs) { newestMs = ms; newest = d; }
  }

  const slices = {};
  for (const crop of SLICE_CROPS) {
    const of = rows.filter((r) => new RegExp(`^${crop}`, 'i').test(String(r.crop || '')));
    if (of.length) slices[crop] = { rows: of.length, markets: new Set(of.map((r) => r.market).filter(Boolean)).size };
  }

  return {
    rows: rows.length,
    crops: uniq('crop'),
    markets: uniq('market'),
    districts: uniq('district'),
    slices,
    retrievedAt: meta.retrievedAt ? String(meta.retrievedAt).slice(0, 10) : null,
    newestObservation: newest ? newest.toISOString().slice(0, 10) : null,
    newestObservationAgeHours: newest ? Math.round(ageMs(newest, new Date()) / 3.6e6 * 10) / 10 : null,
    note: meta.note || null,
  };
}

function historyFacts() {
  if (!has('backend/src/data/priceHistory.json')) return null;
  const hist = readJson('backend/src/data/priceHistory.json');
  const meta = hist.meta || hist._meta || {};
  const days = hist.days || {};
  return { days: Object.keys(days).length, rows: meta.lastRowCount || null, lastAppendedAt: meta.lastAppendedAt ? String(meta.lastAppendedAt).slice(0, 10) : null };
}

function testFacts() {
  // Written by `--record-tests` locally and by .github/workflows/ci.yml on every
  // push, so this number is a measurement, never a memory.
  if (!has('docs/evidence/test-count.json')) return null;
  const t = readJson('docs/evidence/test-count.json');
  return { suites: t.suites, tests: t.tests, failed: t.failed, recordedAt: t.recordedAt };
}

function modelFacts() {
  const dir = 'web-app/public/models/crop-grader';
  if (!has(`${dir}/model-info.json`)) return null;
  const info = readJson(`${dir}/model-info.json`);
  const bytes = fs.readdirSync(abs(dir))
    .filter((f) => /\.(bin|json)$/.test(f))
    .reduce((n, f) => n + fs.statSync(path.join(abs(dir), f)).size, 0);
  const acc = info.testAccuracyPct || {};
  return {
    name: info.model || null,
    version: info.version || null,
    trained: info.trained || null,
    accuracyBinaryPct: acc.binaryFreshRotten ?? null,
    accuracyFinePct: acc.fine18 ?? null,
    testImages: acc.n ?? null,
    megabytes: Math.round(bytes / 104857.6) / 10,
  };
}

function artifactFacts() {
  const read = (p) => (has(p) ? readJson(p) : null);
  const probe = read('docs/evidence/deploy-probe.json');
  const smoke = read('docs/evidence/deployed-smoke.json');
  const api = read('docs/evidence/loadtest-health.json');
  const calc = read('docs/evidence/loadtest-net-realization.json');
  return {
    probe: probe && { verdict: probe.verdict, generatedAt: probe.generatedAt, coldStart: (probe.services || []).filter((s) => s.state === 'cold-start').map((s) => s.name) },
    smoke: smoke && { verdict: smoke.verdict, passed: smoke.passed, failed: smoke.failed, generatedAt: smoke.generatedAt },
    capacity: {
      api: api && api.headline ? { rps: api.headline.rpsAtMaxConcurrency, p95Ms: api.headline.p95MsAtMaxConcurrency, errors: api.headline.errorRateAtMaxConcurrency } : null,
      calculator: calc && calc.headline ? { rps: calc.headline.rpsAtMaxConcurrency, p95Ms: calc.headline.p95MsAtMaxConcurrency, errors: calc.headline.errorRateAtMaxConcurrency } : null,
    },
  };
}

function gatherFacts() {
  return {
    generatedAt: new Date().toISOString(),
    market: marketFacts(),
    history: historyFacts(),
    tests: testFacts(),
    model: modelFacts(),
    artifacts: artifactFacts(),
  };
}

// ── CHECKS ───────────────────────────────────────────────────────────────────
// Tight patterns with a context filter: a number is only a claim about the
// snapshot if the line is talking about the snapshot. Broad matching here would
// train reviewers to ignore the report, which is worse than no report.

function docFiles(dir = 'docs') {
  const out = [];
  for (const entry of fs.readdirSync(abs(dir), { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...docFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

const num = (s) => Number(String(s).replace(/,/g, ''));

function lineChecks(facts) {
  const m = facts.market;
  const t = facts.tests;
  const checks = [];

  if (m) {
    const snapshotish = /agmarknet|snapshot|cache|observed|price/i;
    // A slice value is acceptable only on a line that is *about a slice* — it
    // names the crop AND signals the slice ("slice", "≈"). Two lessons are baked
    // into that rule: "the 388-row snapshot" is a claim about the total even on a
    // line that mentions Onion, and a rewrite that swaps a total for a slice
    // produces a number that is wrong in a way no checker can see.
    const sliceValues = (field) => (line) => {
      if (!/slice|≈|~/.test(line)) return [];
      return Object.entries(m.slices || {})
        .filter(([crop]) => new RegExp(crop, 'i').test(line))
        .map(([, s]) => s[field]);
    };
    // `\s+` and `-` both: "388 rows" and "the 388-row snapshot" are the same
    // claim, and the hyphenated form is how prose writes it.
    checks.push({ label: `snapshot rows (${m.rows})`, context: snapshotish, pattern: /(\d[\d,]{1,4})[-\s]rows?\b/g, expected: m.rows, oneOf: [m.rows], allowSlice: sliceValues('rows') });
    checks.push({ label: `markets (${m.markets})`, context: snapshotish, pattern: /(\d{1,3})\s+markets\b/gi, expected: m.markets, oneOf: [m.markets], allowSlice: sliceValues('markets') });
    checks.push({ label: `districts (${m.districts})`, context: /agmarknet|snapshot|pull|retrieved/i, pattern: /(\d{1,3})\s+districts\b/gi, expected: m.districts, oneOf: [m.districts] });
    // `crops` needs the tighter context: "7 crops" on a line mentioning a price
    // range is about the AGMARK grade rules, not the snapshot.
    checks.push({ label: `crops (${m.crops})`, context: /agmarknet|snapshot|pull|retrieved|cached/i, pattern: /(\d{1,3})\s+crops\b/gi, expected: m.crops, oneOf: [m.crops] });
    // The data-file table states the row count in its own column, with no unit
    // next to it — unmatched by the prose patterns, and stale for a week the
    // first time it was written.
    checks.push({ label: `snapshot rows (${m.rows})`, context: /priceSnapshots/, pattern: /^\|\s*priceSnapshots\.json\s*\|\s*(\d[\d,]*)\s*\|/gim, expected: m.rows, oneOf: [m.rows] });
    if (m.retrievedAt) {
      checks.push({ label: `retrieved date (${m.retrievedAt})`, context: /agmarknet|snapshot|pull|retrieved|cached/i, pattern: /(20\d\d-\d\d-\d\d)\s*(?:pull|retriev)|retriev\w*\s+(20\d\d-\d\d-\d\d)/gi, expected: m.retrievedAt, dateField: [m.retrievedAt, m.newestObservation] });
    }
    if (m.newestObservation) {
      checks.push({ label: `newest observation (${m.newestObservation})`, context: /observation|freshness|arrival/i, pattern: /(20\d\d-\d\d-\d\d)/g, expected: m.newestObservation, oneOf: [m.newestObservation, m.retrievedAt] });
    }
  }
  if (t) {
    checks.push({ label: `backend tests (${t.tests})`, context: /test|suite|jest|backend/i, pattern: /(\d{3})\s*\/\s*(\d{3})\s+tests\b/gi, expected: t.tests, group: 1, oneOf: [t.tests] });
    checks.push({ label: `backend tests (${t.tests})`, context: /test|suite|jest|backend/i, pattern: /(\d{3})\s+backend tests\b/gi, expected: t.tests, group: 1, oneOf: [t.tests] });
    checks.push({ label: `suites (${t.suites})`, context: /suite|jest|backend/i, pattern: /(\d{1,3})\s*\/\s*(\d{1,3})\s+suites\b/gi, expected: t.suites, group: 2, oneOf: [t.suites] });
  }
  if (facts.history && facts.history.rows) {
    checks.push({ label: `history days (${facts.history.days})`, context: /history|trend|appended/i, pattern: /(\d{1,3})\s+(?:days?|day)\b/gi, expected: facts.history.days, oneOf: [facts.history.days, 7, 14, 30] });
  }
  return checks;
}

function scanDocs(facts) {
  const checks = lineChecks(facts);
  const findings = [];
  for (const file of docFiles()) {
    const lines = fs.readFileSync(abs(file), 'utf8').split(/\r?\n/);
    let inFence = false;
    lines.forEach((line, i) => {
      // Sample commands, JSON and captured output are quoted verbatim in the
      // docs; a number inside a fence is an example, not a claim about today.
      if (/^\s*```/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      if (line.includes('evidence-ok')) return;
      // Context may sit on the line above: prose wraps, and a sentence that is
      // half on each line is still one claim.
      const contextLine = `${lines[i - 1] || ''} ${line}`;
      for (const check of checks) {
        if (!check.context.test(contextLine)) continue;
        check.pattern.lastIndex = 0;
        let match;
        while ((match = check.pattern.exec(line)) !== null) {
          // Date checks carry two capture groups; take whichever matched.
          const raw = check.dateField
            ? (match[1] || match[2])
            : match[check.group || 1];
          if (!raw) continue;
          const sliceExtra = check.allowSlice ? check.allowSlice(contextLine) : [];
          const allowed = check.dateField || check.oneOf || [check.expected];
          // Dates compare as strings, counts as numbers. Coercing a date to a
          // number yields NaN, which matches nothing — a checker that silently
          // cannot fail is worse than no checker.
          const value = typeof check.expected === 'number' ? num(raw) : raw;
          if (typeof value === 'number' && sliceExtra.includes(value)) continue;
          if (allowed.includes(value)) continue;
          // The value a writer should substitute: the slice for a line that names
          // its crop, otherwise the fact the check is about.
          const sliceTarget = check.allowSlice ? check.allowSlice(contextLine)[0] : undefined;
          findings.push({
            file,
            line: i + 1,
            check: check.label,
            word: raw.trim(),
            target: String(sliceTarget !== undefined ? sliceTarget : check.expected),
            text: line.trim().slice(0, 140),
          });
        }
      }
    });
  }
  return findings;
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────

function printFacts(facts) {
  const m = facts.market || {};
  const t = facts.tests;
  console.log('\n📐 Evidence — facts read from artifacts\n');
  console.log(`  market      ${m.rows} rows · ${m.crops} crops · ${m.markets} markets · ${m.districts} districts · retrieved ${m.retrievedAt}`);
  console.log(`  observation newest ${m.newestObservation} (${m.newestObservationAgeHours}h old)`);
  if (m.slices && m.slices.onion) console.log(`  onion slice ${m.slices.onion.rows} rows · ${m.slices.onion.markets} markets (the only per-crop figure docs may quote)`);
  if (facts.history) console.log(`  history     ${facts.history.days} days, ${facts.history.rows} rows appended`);
  console.log(`  tests       ${t ? `${t.tests} across ${t.suites} suites (recorded ${t.recordedAt})` : 'unknown — run `node scripts/evidence.cjs --record-tests <jest.json>`'}`);
  if (facts.model) console.log(`  grader      ${facts.model.name} v${facts.model.version}, trained ${facts.model.trained}, ${facts.model.accuracyBinaryPct}% fresh/rotten on ${facts.model.testImages} held-out images, ${facts.model.megabytes} MB shipped`);
  const a = facts.artifacts;
  if (a.probe) console.log(`  deploy      ${a.probe.verdict} (${a.probe.generatedAt})`);
  if (a.smoke) console.log(`  smoke       ${a.smoke.verdict} — ${a.smoke.passed} passed, ${a.smoke.failed} failed`);
  if (a.capacity && a.capacity.api) console.log(`  capacity    api ${a.capacity.api.rps} req/s @p95 ${a.capacity.api.p95Ms}ms · calculator ${a.capacity.calculator.rps} req/s @p95 ${a.capacity.calculator.p95Ms}ms`);
}

function reportFindings(findings) {
  if (!findings.length) {
    console.log('\n✅ Docs agree with artifacts — no drift.\n');
    return;
  }
  console.log(`\n⚠️  ${findings.length} doc claim(s) disagree with the machine:\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  claims "${f.word}" · expects ${f.check}`);
    console.log(`      ${f.text}`);
  }
  console.log('\n  Fix the number, or mark the line `evidence-ok` when it is deliberately historical.\n');
}

/**
 * Rewrite the numbers the checker flagged, in place.
 *
 * Only tokens already proven to disagree are touched, each replaced once, and
 * every substitution is printed — so the resulting diff is reviewable rather
 * than a silent sweep. Re-scans after writing (a line can hold several claims).
 */
function writeDrift(facts, { apply }) {
  let findings = scanDocs(facts);
  const changes = [];
  for (let pass = 0; pass < 3 && findings.length; pass += 1) {
    const byFile = new Map();
    for (const f of findings) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, list] of byFile) {
      const lines = fs.readFileSync(abs(file), 'utf8').split(/\r?\n/);
      for (const f of list) {
        const idx = f.line - 1;
        const escaped = f.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?<![\\w,])${escaped}(?![\\w,])`);
        if (!re.test(lines[idx])) continue;
        changes.push({ file, line: f.line, from: f.word, to: f.target, check: f.check });
        if (apply) lines[idx] = lines[idx].replace(re, f.target);
      }
      if (apply) fs.writeFileSync(abs(file), lines.join('\n'));
    }
    if (!apply) break;
    findings = scanDocs(gatherFacts());
  }
  return { changes, remaining: findings };
}

function recordTests(inputPath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const reduced = {
    suites: raw.numTotalTestSuites ?? (raw.testResults || []).length,
    tests: raw.numTotalTests ?? null,
    failed: raw.numFailedTests ?? null,
    recordedAt: new Date().toISOString().slice(0, 10),
    note: 'Written by scripts/evidence.cjs --record-tests (ci.yml runs it on every push). The doc numbers are checked against this — never typed.',
  };
  fs.writeFileSync(abs('docs/evidence/test-count.json'), `${JSON.stringify(reduced, null, 2)}\n`);
  console.log(`📝 recorded ${reduced.tests} tests across ${reduced.suites} suites → docs/evidence/test-count.json`);
}

function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === '--record-tests') {
    if (!argv[1]) { console.error('usage: node scripts/evidence.cjs --record-tests <jest-json>'); process.exit(2); }
    recordTests(argv[1]);
    return;
  }

  const facts = gatherFacts();
  const findings = scanDocs(facts);

  if (argv.includes('--write')) {
    const apply = argv.includes('--yes');
    const { changes, remaining } = writeDrift(facts, { apply });
    printFacts(facts);
    if (!changes.length) console.log('\n✅ Nothing to rewrite — docs already agree.\n');
    else {
      console.log(`\n${apply ? '✏️  Rewrote' : '📝 Would rewrite (dry run — add --yes to apply)'} ${changes.length} number(s):\n`);
      for (const c of changes) console.log(`  ${c.file}:${c.line}  ${c.from} → ${c.to}   (${c.check})`);
      console.log('');
    }
    if (apply && remaining.length) { reportFindings(remaining); process.exit(1); }
    if (apply) fs.writeFileSync(abs('docs/evidence/facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
    process.exit(0);
  }

  if (argv.includes('--check')) {
    printFacts(facts);
    reportFindings(findings);
    process.exit(findings.length ? 1 : 0);
  }

  fs.writeFileSync(abs('docs/evidence/facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  printFacts(facts);
  console.log('  written     docs/evidence/facts.json');
  reportFindings(findings);
}

main();
