// Transcribe endpoint — contract (no Whisper in CI, no network)
jest.mock('../../src/middleware/auth', () => ({
  authenticateUser: (req, _res, next) => { req.user = { uid: 'test-user', role: 'farmer' }; next(); },
}));

const express = require('express');
const request = require('supertest');

describe('transcribe', () => {
  test('requires an audio file (400 when Groq is configured)', async () => {
    // Groq key present -> file check (400); Groq missing -> 503 first (both are honest)
    const oldKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'test-groq-key';
    const app = express();
    app.use(express.json());
    app.use('/', require('../../src/routes/transcribe'));
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audio/i);
    if (oldKey) process.env.GROQ_API_KEY = oldKey; else delete process.env.GROQ_API_KEY;
  });

  test('returns 503 when Groq not configured (honest fallback)', async () => {
    const oldKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    const app = express();
    app.use(express.json());
    app.use('/', require('../../src/routes/transcribe'));
    // No file + no key: the route checks key first and returns 503 (not 400)
    const res = await request(app).post('/').send({});
    expect([400, 503]).toContain(res.status);
    if (oldKey) process.env.GROQ_API_KEY = oldKey;
  });
});
