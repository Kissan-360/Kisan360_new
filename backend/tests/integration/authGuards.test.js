/**
 * Auth guards on the three write surfaces that had none (audit finding), plus
 * the ownership/impersonation contract:
 *
 *   community         10 write routes took identity from body/query userId —
 *                     anyone could author, edit or delete as anyone
 *   grade-assessment  5 endpoints had NO auth; identity came from an
 *                     x-demo-uid header, so certificates (and the FPO
 *                     verification that anchors the grading chain) could be
 *                     forged with curl
 *   chat              POST / was an open, metered LLM proxy
 *
 * The grade round-trip tests also pin the DB split this suite exposed: POST
 * saved certificates to Mongo while GET /:id and fpo-verify searched only the
 * in-memory list — with a live DB every certificate 404'd, the farmer's own
 * FPO-submit 403'd, and a privileged role could "verify" an id that did not
 * exist. Run this file before that fix and those three tests fail.
 *
 * Reads stay public by design (the audit's explicit choice): browsing,
 * trust display and AGMARK reference need no token.
 *
 * Run:  npm test
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const getFreePort = require('../helpers/freePort');

jest.setTimeout(120000);

const BACKEND_DIR = path.join(__dirname, '..', '..');
let PORT;
let BASE;

let mem;
let server;

async function waitHealth(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) { lastErr = err; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Backend did not become healthy: ${lastErr && lastErr.message}`);
}

async function call(method, route, { token, body, headers } = {}) {
  const h = { ...(headers || {}) };
  // fetch forbids a body on GET/HEAD — drop it for those verbs.
  const canHaveBody = method !== 'GET' && method !== 'HEAD';
  const payload = canHaveBody && body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: h,
    body: payload,
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

let farmerToken;
let buyerToken;
let fpoToken;

beforeAll(async () => {
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  mem = await MongoMemoryServer.create();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGODB_URI: mem.getUri('kisan360'),
      NODE_ENV: 'test',
      // Blank the LLM key so chat answers locally. dotenv does NOT override
      // existing keys (verified: hasOwnProperty check, override=false), so
      // this blank survives backend/.env — no test ever reaches Groq.
      GROQ_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[api-err] ${d}`));
  await waitHealth(`${BASE}/health`);

  const f = await call('POST', '/api/auth/demo-login', { body: { role: 'farmer', name: 'Ramesh', district: 'Nashik' } });
  farmerToken = f.data.token;
  const b = await call('POST', '/api/auth/demo-login', { body: { role: 'buyer', name: 'Demo Buyer' } });
  buyerToken = b.data.token;
  const p = await call('POST', '/api/auth/demo-login', { body: { role: 'fpo', name: 'Demo FPO' } });
  fpoToken = p.data.token;
  expect(farmerToken).toBeTruthy();
  expect(buyerToken).toBeTruthy();
  expect(fpoToken).toBeTruthy();
});

afterAll(async () => {
  if (server) { server.kill(); await new Promise(r => setTimeout(r, 300)); }
  if (mem) await mem.stop();
});

// ── 1. anonymous writes are rejected ────────────────────────────────────────

describe('auth guards: 401 without a token', () => {
  const writes = [
    ['POST', '/api/community/topics'],
    ['PUT', '/api/community/topics/anyid'],
    ['DELETE', '/api/community/topics/anyid'],
    ['PUT', '/api/community/comments/anyid'],
    ['DELETE', '/api/community/comments/anyid'],
    ['POST', '/api/community/topics/anyid/vote'],
    ['POST', '/api/community/topics/anyid/report'],
    ['POST', '/api/community/topics/anyid/comments'],
    ['POST', '/api/community/comments/anyid/vote'],
    ['POST', '/api/community/comments/anyid/report'],
    ['POST', '/api/grade-assessment'],
    ['GET', '/api/grade-assessment/anyid'],
    ['POST', '/api/grade-assessment/anyid/fpo-verify'],
    ['POST', '/api/chat'],
  ];

  test.each(writes)('%s %s rejects anonymous callers', async (method, route) => {
    const res = await call(method, route, { body: {} });
    expect(res.status).toBe(401);
  });

  test('a garbage bearer token is 401, not 500', async () => {
    const res = await call('POST', '/api/community/topics', { token: 'not-a-real-jwt', body: {} });
    expect(res.status).toBe(401);
  });
});

// ── 2. reads stay public (the deliberate split) ─────────────────────────────

describe('public reads need no token', () => {
  test('community topic list is browsable anonymously', async () => {
    const res = await call('GET', '/api/community/topics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.topics)).toBe(true);
    expect(res.data.topics.length).toBeGreaterThan(0);
  });

  test('trust display works without a token (optionalAuth)', async () => {
    const res = await call('GET', '/api/community/me/trusted');
    expect(res.status).toBe(200);
    expect(typeof res.data.trust).toBe('number');
  });

  test('AGMARK grade reference is public', async () => {
    const crops = await call('GET', '/api/grade-assessment/crops');
    expect(crops.status).toBe(200);
    const ref = await call('GET', '/api/grade-assessment/reference/onion');
    expect(ref.status).toBe(200);
    expect(ref.data.reference).toBeTruthy();
  });
});

// ── 3. community ownership: the token decides identity ──────────────────────

describe('community ownership cannot be spoofed', () => {
  let topicId;
  let commentId;

  test('body userId cannot impersonate another author', async () => {
    const res = await call('POST', '/api/community/topics', {
      token: farmerToken,
      body: {
        title: 'Ownership probe topic',
        content: 'Created to prove identity comes from the verified token.',
        category: 'general_farming',
        userId: 'spoofed-uid-should-be-ignored',
      },
    });
    expect(res.status).toBe(201);
    topicId = res.data.topic.id;
    expect(topicId).toBeTruthy();
    expect(res.data.topic.authorId).toBe('demo-farmer');
  });

  test('another authenticated user cannot edit or delete it', async () => {
    const edit = await call('PUT', `/api/community/topics/${topicId}`, {
      token: buyerToken,
      body: { title: 'Hijacked title attempt' },
    });
    expect(edit.status).toBe(403);

    const del = await call('DELETE', `/api/community/topics/${topicId}`, { token: buyerToken });
    expect(del.status).toBe(403);

    const still = await call('GET', `/api/community/topics/${topicId}`);
    expect(still.status).toBe(200);
    expect(still.data.topic.authorId).toBe('demo-farmer');
  });

  test('the author can edit within the 15-minute window', async () => {
    const res = await call('PUT', `/api/community/topics/${topicId}`, {
      token: farmerToken,
      body: { title: 'Ownership probe topic (edited)' },
    });
    expect(res.status).toBe(200);
    expect(res.data.topic.title).toBe('Ownership probe topic (edited)');
  });

  test('comments carry token identity and only the author may edit', async () => {
    const posted = await call('POST', `/api/community/topics/${topicId}/comments`, {
      token: farmerToken,
      body: { content: 'Ownership probe reply text.', userId: 'spoofed-uid' },
    });
    expect(posted.status).toBe(201);
    commentId = posted.data.comment.id;
    expect(posted.data.comment.authorId).toBe('demo-farmer');

    const buyerEdit = await call('PUT', `/api/community/comments/${commentId}`, {
      token: buyerToken,
      body: { content: 'Hijacked reply attempt.' },
    });
    expect(buyerEdit.status).toBe(403);

    const authorEdit = await call('PUT', `/api/community/comments/${commentId}`, {
      token: farmerToken,
      body: { content: 'Ownership probe reply (edited).' },
    });
    expect(authorEdit.status).toBe(200);
    expect(authorEdit.data.comment.content).toBe('Ownership probe reply (edited).');
  });

  test('the author can soft-delete; the topic then404s for everyone', async () => {
    const del = await call('DELETE', `/api/community/topics/${topicId}`, { token: farmerToken });
    expect(del.status).toBe(200);

    const gone = await call('GET', `/api/community/topics/${topicId}`);
    expect(gone.status).toBe(404);
  });
});

// ── 4. grade certificates: identity, access, persistence ────────────────────

describe('grade certificates are forged-proof and persistent', () => {
  let certId;

  test('x-demo-uid header cannot choose the certificate owner', async () => {
    const res = await call('POST', '/api/grade-assessment', {
      token: farmerToken,
      headers: { 'x-demo-uid': 'evil-uid' },
      body: { crop: 'soybean', params: { moisture: 8.5, damage: 1.8, oilContent: 19.5 } },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    certId = res.data.certificate.id;
    expect(certId).toBeTruthy();

    // Round-trip read: this404'd with a live DB before the fix (POST wrote to
    // Mongo, GET searched only the in-memory array).
    const back = await call('GET', `/api/grade-assessment/${certId}`, { token: farmerToken });
    expect(back.status).toBe(200);
    expect(back.data.certificate.farmerUid).toBe('demo-farmer');
  });

  test('reads are owner-or-FPO only', async () => {
    const otherFarmer = await call('GET', `/api/grade-assessment/${certId}`, { token: buyerToken });
    expect(otherFarmer.status).toBe(403);

    const fpo = await call('GET', `/api/grade-assessment/${certId}`, { token: fpoToken });
    expect(fpo.status).toBe(200);
    expect(fpo.data.certificate.farmerUid).toBe('demo-farmer');
  });

  test('FPO-submit: non-holder non-FPO refused, holder succeeds', async () => {
    const denied = await call('POST', `/api/grade-assessment/${certId}/fpo-verify`, {
      token: buyerToken,
      body: { status: 'FPO_VERIFIED' },
    });
    expect(denied.status).toBe(403);

    // The documented demo flow: the farmer self-submits from GradeCrop.tsx.
    // This403'd with a live DB before the fix.
    const ok = await call('POST', `/api/grade-assessment/${certId}/fpo-verify`, {
      token: farmerToken,
      body: { status: 'FPO_VERIFIED', fpoName: 'Demo FPO Nashik' },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.certificate.fpoStatus).toBe('FPO_VERIFIED');
    expect(ok.data.certificate.fpoVerifiedBy).toBe('demo-farmer');
  });

  test('verification persists: a fresh read shows FPO_VERIFIED', async () => {
    const res = await call('GET', `/api/grade-assessment/${certId}`, { token: farmerToken });
    expect(res.status).toBe(200);
    expect(res.data.certificate.fpoStatus).toBe('FPO_VERIFIED');
  });

  test('fpo-verify on a non-existent certificate is 404, not a fake success', async () => {
    // Before the fix a privileged role got 200 for an id that never existed.
    const res = await call('POST', '/api/grade-assessment/64b000000000000000000000/fpo-verify', {
      token: fpoToken,
      body: { status: 'FPO_VERIFIED' },
    });
    expect(res.status).toBe(404);
  });

  test('a malformed certificate id is 404, not 500', async () => {
    const res = await call('GET', '/api/grade-assessment/not-an-object-id', { token: farmerToken });
    expect(res.status).toBe(404);
  });
});

// ── 5. chat: authed request answered without an LLM key ─────────────────────

describe('chat requires auth but still answers offline', () => {
  test('an authenticated greeting is answered from the local fallback', async () => {
    const res = await call('POST', '/api/chat', {
      token: farmerToken,
      body: { message: 'hello', language: 'en', mode: 'action' },
    });
    expect(res.status).toBe(200);
    expect(typeof res.data.text).toBe('string');
    expect(res.data.text.length).toBeGreaterThan(0);
    expect(res.data.mode).toBe('action');
  });
});
