#!/usr/bin/env node
/**
 * E2E (in-process): full agent turn — chat → tools → structured shape.
 * No Groq key needed (tools degrade gracefully when ML services are down).
 * Run: node scripts/e2e-agent.js
 */
const chat = require("../src/routes/chat");

async function main() {
  let ok = 0, total = 0;
  const check = (name, cond) => {
    total++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (cond) ok++;
  };

  // 1) Marathi multi-intent + tool wiring
  const msg = "माझ्या कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?";
  const intents = chat.classifyIntents(msg).map((i) => i.intent);
  check("multi-intent Marathi", intents.includes("compare_mandis") && intents.includes("crop_health"));

  // 2) Action path returns text + suggestions + action (+ toolResults when economics available)
  const res1 = await chat.executeIntent({
    message: msg, language: "mr", context: { crop: "Onion", district: "Nashik", quantity: 10 },
    classification: chat.classifyIntent(msg), mode: "action",
  });
  check("action: text non-empty", !!res1.text?.length);
  check("action: navigate present or toolResults", !!res1.action?.path || !!res1.toolResults?.netRealization);
  check("action: netRealization tool shape (or graceful null)", res1.toolResults == null || !!res1.toolResults.netRealization?.best);

  // 3) Schemes tool
  const res2 = await chat.executeIntent({
    message: "Show PM-KISAN scheme", language: "en", context: {},
    classification: chat.classifyIntent("Show PM-KISAN scheme"), mode: "action",
  });
  check("schemes tool present", !!res2.toolResults?.schemes?.schemes?.length);

  // 4) Ask-mode agent path (advisory intent tries RAG first, falls back — never crashes)
  const res3 = await chat.executeIntent({
    message: "How to control thrips on onion", language: "en", context: { crop: "Onion", district: "Nashik" },
    classification: chat.classifyIntent("How to control thrips on onion"), mode: "ask",
  });
  check("ask advisory: text non-empty", !!res3.text?.length);

  // 4b) First-run onboarding: economics without crop/district asks, not navigate
  const resOnboard = await chat.executeIntent({
    message: "Compare mandis", language: "mr", context: {},
    classification: chat.classifyIntent("Compare mandis"), mode: "action",
  });
  check("onboarding asks for crop/district (mr)", !!resOnboard.text?.includes("पीक"));
  check("onboarding does not navigate prematurely", !resOnboard.action);

  // 5) Weather tool shape (no key -> null or context passthrough; never invented)
  const w = await chat.fetchWeatherTool("weather in Nashik", { district: "Nashik" });
  check("weather tool graceful", w === null || !!w.current);

  console.log(`\n${ok}/${total} passed`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
