/**
 * WhatsApp weather alerts — proactive, not just share links.
 * Checks district weather (OpenWeather) for severe conditions and sends
 * a WhatsApp Cloud template when a threshold is crossed.
 * No-ops gracefully when WHATSAPP_* or OPENWEATHER_API_KEY are unset.
 */
const axios = require('axios');

async function shouldAlert(weather) {
  const t = weather?.current?.temperature;
  const h = weather?.current?.humidity;
  const cond = (weather?.current?.condition || '').toLowerCase();
  if (t != null && t > 40) return 'Heat wave alert: increase irrigation, mulch, avoid fertilizer in heat.';
  if (h != null && h > 85) return 'High humidity alert: fungal disease risk — preventive fungicide advised.';
  if (cond.includes('rain') || cond.includes('thunder')) return 'Rain alert: delay pesticide/fertilizer, ensure drainage.';
  return null;
}

async function sendAlert(to, message, template = 'kisan_alert') {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, reason: 'not configured' };
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: 'mr' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
      },
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
  );
  return { ok: true, messageId: res.data?.messages?.[0]?.id || null };
}

module.exports = { shouldAlert, sendAlert };
