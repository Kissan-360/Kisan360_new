#!/usr/bin/env node
/**
 * Prod readiness: ping the deployed stack (API + calc + web).
 * Run: API_URL=https://kisan360-api.onrender.com CALC_URL=https://kisan360-calc.onrender.com node scripts/prod-check.js
 */
const API = (process.env.API_URL || "https://kisan360-api.onrender.com").replace(/\/$/, "");
const CALC = (process.env.CALC_URL || "https://kisan360-calc.onrender.com").replace(/\/$/, "");

async function check(name, url, timeout = 60000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    const data = await res.json().catch(() => ({}));
    console.log(`${res.ok ? "PASS" : "FAIL"}  ${name} ${res.status} — ${data.status || data.serviceStatus || "ok"}`);
    return res.ok;
  } catch (e) {
    console.log(`FAIL  ${name} — ${e.message} (waking? retry in 60s)`);
    return false;
  }
}

async function main() {
  const results = await Promise.all([
    check("API /health", `${API}/health`),
    check("Calc /health", `${CALC}/health`),
    check("Web /, always up", `${API.replace("kisan360-api", "kisan360-web").replace(":5000", "")}/`, 15000),
  ]);
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/3 passed`);
  process.exit(ok === 3 ? 0 : 1);
}

main();
