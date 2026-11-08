#!/usr/bin/env node
/**
 * Eval: chat intent classifier (EN/MR/HI) + entity extraction.
 * Run: node scripts/eval-intents.js
 */
const { classifyIntents, normalizeMessage } = (() => {
  const path = require("path");
  // Load router without booting server (module exports pure helpers)
  const router = require(path.join(__dirname, "../src/routes/chat"));
  return {
    classifyIntents: router.classifyIntents || ((m) => [router.classifyIntent(m)]),
    normalizeMessage: router.normalizeMessage,
  };
})();

const CASES = [
  { msg: "Compare mandis for onion", expect: "compare_mandis" },
  { msg: "कांद्यासाठी बाजार तुलना करा", expect: "compare_mandis" },
  { msg: "प्याज़ के लिए मंडियाँ तुलना करें", expect: "compare_mandis" },
  { msg: "What is net realization? Explain pocket", expect: "explain_net_realization" },
  { msg: "निव्वळ नफा कसा काम करतो?", expect: "explain_net_realization" },
  { msg: "Show government schemes PM-KISAN", expect: "govt_schemes" },
  { msg: "Weather forecast today?", expect: "weather_info" },
  { msg: "हवामान कसा आहे?", expect: "weather_info" },
  { msg: "leaf disease check photo", expect: "crop_health" },
  { msg: "माझ्या कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?", expectAny: ["compare_mandis", "crop_health"] },
  { msg: "hello namaste", expect: "greeting" },
];

let pass = 0;
for (const c of CASES) {
  const res = classifyIntents(c.msg);
  const top = res[0]?.intent;
  const intents = res.map((r) => r.intent);
  const ok = c.expectAny ? c.expectAny.some((e) => intents.includes(e)) : top === c.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  "${c.msg}" -> ${intents.join(", ")} (expected ${c.expect || c.expectAny.join("/")})`);
  if (ok) pass++;
}
console.log(`\n${pass}/${CASES.length} passed`);
process.exit(pass === CASES.length ? 0 : 1);
