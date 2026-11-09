// WhatsApp notifications — endpoint contract (no Cloud API in CI)
jest.mock('../../src/middleware/auth', () => ({
  authenticateUser: (req, _res, next) => { req.user = { uid: 'test-user', role: 'farmer' }; next(); },
}));

const express = require('express');
const request = require('supertest');

describe('whatsapp notifications', () => {
  test('requires a phone number (400)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/', require('../../src/routes/whatsapp'));
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('returns 503 when not configured (honest fallback)', async () => {
    const oldToken = process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const app = express();
    app.use(express.json());
    app.use('/', require('../../src/routes/whatsapp'));
    const res = await request(app).post('/').send({ to: '919999999999' });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.mocked).toBe(true);
    if (oldToken) process.env.WHATSAPP_TOKEN = oldToken;
  });
});
