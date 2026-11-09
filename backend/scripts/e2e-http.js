#!/usr/bin/env node
/**
 * HTTP E2E smoke — assumes backend (+ optional calculator) are already running.
 * Run: BASE_URL=http://localhost:5000 node scripts/e2e-http.js
 * Steps are graceful: if the calculator/RAG is down, those sections SKIP (not FAIL).
 */
const BASE = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");

async function http(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function main() {
  let pass = 0, total = 0;
  const check = (name, cond, note = "") => {
    total++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${note ? ` — ${note}` : ""}`);
    if (cond) pass++;
  };
  const skip = (name, note) => { console.log(`SKIP  ${name} — ${note}`); };

  // 1) Health
  try {
    const h = await http("/health");
    check("GET /health", h.status === 200 && !!h.data?.status, h.data?.status || "");
    console.log(`  db=${h.data?.db} ml=${h.data?.mlServiceStatus}`);
  } catch (e) { check("GET /health", false, e.message); process.exit(1); }

  // 2) Demo login
  const login = await http("/api/auth/demo-login", { method: "POST", body: { role: "farmer", district: "Nashik" } });
  const token = login.data?.token;
  check("POST /api/auth/demo-login", login.status === 200 && !!token, login.data?.user?.role || login.data?.error || "");
  if (!token) { console.log(`\n${pass}/${total} passed (stopped: no token)`); process.exit(1); }

  // 3) Chat (Marathi multi-intent)
  const chat = await http("/api/chat", {
    method: "POST", token,
    body: { message: "माझ्या कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?", language: "mr", mode: "action", context: { crop: "Onion", district: "Nashik", quantity: 10 } },
  });
  check("POST /api/chat multi-intent", chat.status === 200 && !!chat.data?.text, chat.data?.intent || "");
  console.log(`  intents=${(chat.data?.intents || []).join(", ")} toolResults=${!!chat.data?.toolResults}`);

  // 4) Net realization (calculator may be asleep/offline -> SKIP, never false-fail)
  const net = await http("/api/market/net-realization?crop=Onion&district=Nashik&quantity=10", { token });
  if (net.status === 200 && net.data?.rankedMandis?.length) {
    check("GET /api/market/net-realization", true, `${net.data.rankedMandis[0].market} Rs ${net.data.rankedMandis[0].farmerNetPerQuintal}/q`);
  } else if (net.status === 503) {
    skip("GET /api/market/net-realization", `calculator ${net.data?.serviceStatus || "offline/waking"} — warm via keepalive`);
  } else {
    check("GET /api/market/net-realization", false, `${net.status}: ${net.data?.error || "?"}`);
  }

  // 5) Advisory agent-first (RAG may be down -> fallback still 200)
  const adv = await http("/api/advisory?crop=Onion&location=Nashik&query=thrips%20control", { token });
  check("GET /api/advisory", adv.status === 200 && !!adv.data?.recommendations?.length, adv.data?.source || "");

  // 6) FPO pooling (needs DB; graceful when offline)
  const fpo = await http("/api/fpo/pool", { method: "POST", token, body: { crop: "Onion", district: "Nashik", quantity: 40 } });
  if (fpo.status === 200) {
    check("POST /api/fpo/pool", true, fpo.data?.pooledNetPerQuintal != null ? `pooled Rs ${fpo.data.pooledNetPerQuintal}/q` : "ok");
  } else if (fpo.status === 503) {
    skip("POST /api/fpo/pool", `DB offline (${fpo.data?.error || "503"})`);
  } else {
    check("POST /api/fpo/pool", false, `${fpo.status}: ${fpo.data?.error || "?"}`);
  }

  // 7) Disease safety gate (no image -> 400; proves the OOD path exists without ML)
  const dis = await http("/api/disease/detect", { method: "POST", token, body: {} });
  check("POST /api/disease/detect (no image -> 400)", dis.status === 400, dis.data?.error || "");

  // 8) Chat history (server-side, cross-device) — written by step 3
  const hist = await http("/api/chat/history", { token });
  check("GET /api/chat/history", hist.status === 200 && Array.isArray(hist.data?.history), `rows=${hist.data?.history?.length || 0}`);

  console.log(`\n${pass}/${total} passed`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
