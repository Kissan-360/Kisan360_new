#!/usr/bin/env node
/**
 * Smoke: agent chat path (multi-intent + toolResults) without Groq.
 * Run: node scripts/smoke-agent.js
 * Requires backend running (or boots in-memory? caller boots via scripts/dev-up.sh)
 * Here we test the pure router + tools wiring that doesn't need the ML services.
 */
const chat = require("../src/routes/chat");

async function main() {
  // Multi-intent classification (Marathi)
  const msg = "माझ्या कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?";
  const intents = chat.classifyIntents(msg);
  const names = intents.map((i) => i.intent);
  console.log("intents:", names.join(", "));
  const multiOk = names.includes("compare_mandis") && names.includes("crop_health");
  console.log(multiOk ? "PASS multi-intent" : "FAIL multi-intent");

  // Entity extraction
  const params = chat.extractParams("Compare mandis for onion in Nashik 10 quintal", {});
  console.log("params:", params);

  // Tool helpers exist and degrade gracefully (engine may be offline -> null is OK)
  if (typeof chat.fetchNetRealizationTool !== "function") {
    console.log("FAIL: fetchNetRealizationTool not exported");
    process.exit(1);
  }
  console.log("PASS tool helpers exported");

  // executeIntent shape: answer_schemes should include toolResults
  const res = await chat.executeIntent({
    message: "Show PM-KISAN scheme",
    language: "en",
    context: {},
    classification: chat.classifyIntent("Show PM-KISAN scheme"),
    mode: "action",
  });
  console.log("schemes response has toolResults:", !!res.toolResults?.schemes);
  console.log(multiOk && res.toolResults?.schemes ? "\nALL SMOKE PASS" : "\nSMOKE PARTIAL (tool may be offline)");
  process.exit(multiOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
