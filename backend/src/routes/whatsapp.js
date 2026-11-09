const express = require('express');
const axios = require('axios');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// POST /api/notifications/whatsapp/weather-alert — proactive severe-weather alert
router.post('/weather-alert', authenticateUser, async (req, res) => {
  try {
    const { to, district } = req.body || {};
    if (!to || !district) return res.status(400).json({ success: false, error: 'to and district are required' });
    const chatMod = require('./chat');
    const weatherTool = chatMod.fetchWeatherTool
      ? await chatMod.fetchWeatherTool(`weather in ${district}`, { district })
      : null;
    const weather = weatherTool?.current ? { current: weatherTool.current } : null;
    if (!weather) return res.json({ success: true, alert: null, note: 'No live weather available — no alert sent.' });
    const { shouldAlert, sendAlert } = require('../services/whatsappAlerts');
    const msg = shouldAlert(weather);
    if (!msg) return res.json({ success: true, alert: null, weather });
    const sent = await sendAlert(to, msg);
    res.json({ success: true, alert: msg, sent, weather });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Weather alert failed' });
  }
});

// POST /api/notifications/whatsapp — send a template via WhatsApp Cloud API
// Body: { to, template, params?: { crop?, district?, disease? } }
// Requires WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (verified sender).
// Without them: 503 with honest note (falls back to in-app notifications).
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { to, template = 'kisan_alert', params = {} } = req.body || {};
    if (!to) return res.status(400).json({ success: false, error: 'to (phone number) is required' });
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp Cloud not configured — in-app notifications remain available',
        mocked: true,
      });
    }
    const components = params && Object.keys(params).length
      ? [{ type: 'body', parameters: Object.values(params).map((v) => ({ type: 'text', text: String(v) })) }]
      : [];
    const wRes = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template, language: { code: 'mr' }, ...(components.length ? { components } : {}) },
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    res.json({ success: true, messageId: wRes.data?.messages?.[0]?.id || null });
  } catch (e) {
    if (e.response) {
      return res.status(502).json({ success: false, error: 'WhatsApp Cloud error', details: e.response.data?.error?.message || e.message });
    }
    res.status(500).json({ success: false, error: 'WhatsApp send failed' });
  }
});

module.exports = router;
