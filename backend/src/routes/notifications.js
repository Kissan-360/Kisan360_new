const express = require('express');
const axios = require('axios');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const Lot = require('../models/Lot');
const Offer = require('../models/Offer');
const Payment = require('../models/Payment');
const Grievance = require('../models/Grievance');
const PriceAlert = require('../models/PriceAlert');
const priceHistory = require('../services/priceHistory');
const { validatePriceAlertInput, priceAlertItems } = require('../services/priceAlerts');
const router = express.Router();

// Notifications are DERIVED, never stored: deal events come from the
// farmer's own lots/offers/payments/grievances, weather from OpenWeather.
// Every item carries a STABLE id (record id + status, or kind + day) so the
// list never duplicates or regenerates across polls — the old code minted
// `tip_<Date.now()>` on every request, which made "unread" meaningless.
// Items carry { kind, params } for frontend i18n plus an English
// title/message fallback and a `to` route, so a tap always goes somewhere.

const dayKey = (d = new Date()) => new Date(d).toISOString().slice(0, 10);

function weatherItems(c, day) {
  const items = [];
  const temp = c?.main?.temp;
  const humidity = c?.main?.humidity;
  // Day-start timestamp: a weather alert is "new" once per day. Using `now`
  // would mint a fresh timestamp on every poll and the unread badge could
  // never clear.
  const at = `${day}T00:00:00.000Z`;
  const push = (suffix, kind, params, title, message, type) => items.push({
    id: `wx_${suffix}_${day}`,
    kind,
    params,
    title,
    message,
    type,
    category: 'weather',
    to: '/weather',
    createdAt: at,
  });

  if (typeof temp === 'number') {
    if (temp > 40) {
      push('heat', 'wx_heat', { temp: Math.round(temp) },
        'Heatwave Alert',
        `Temperature is ${Math.round(temp)}°C — take precautions to protect crops and livestock. Increase irrigation.`,
        'danger');
    } else if (temp > 35) {
      push('warm', 'wx_warm', { temp: Math.round(temp) },
        'High Temperature Warning',
        `Temperature at ${Math.round(temp)}°C. Monitor soil moisture and consider shade for sensitive crops.`,
        'warning');
    }
    if (temp < 5) {
      push('frost', 'wx_frost', { temp: Math.round(temp) },
        'Frost Alert',
        `Temperature at ${Math.round(temp)}°C — frost risk. Cover seedlings, irrigate before nightfall.`,
        'danger');
    }
  }
  if (typeof humidity === 'number') {
    if (humidity > 85) {
      push('humid', 'wx_humid_high', { humidity },
        'High Humidity Alert',
        `Humidity at ${humidity}% — high risk of fungal diseases. Apply preventive fungicide and improve air circulation.`,
        'warning');
    } else if (humidity < 25) {
      push('dry', 'wx_humid_low', { humidity },
        'Low Humidity Warning',
        `Humidity at ${humidity}% — increased risk of pest infestation. Monitor for thrips and mites.`,
        'warning');
    }
  }
  if (c?.rain?.['1h'] || c?.rain?.['3h']) {
    push('rain', 'wx_rain', {},
      'Rain Alert',
      'Rain detected. Delay fertilizer and pesticide applications. Ensure field drainage is working.',
      'info');
  }
  if (c?.weather?.[0]?.main === 'Thunderstorm') {
    push('storm', 'wx_storm', {},
      'Thunderstorm Warning',
      'Thunderstorm detected. Seek shelter, disconnect irrigation equipment. Secure loose farm objects.',
      'danger');
  }
  return items;
}

async function fetchWeather(lat, lon) {
  try {
    const wRes = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      { params: { lat, lon, appid: process.env.OPENWEATHER_API_KEY, units: 'metric' }, timeout: 5000 }
    );
    return wRes.data;
  } catch (e) {
    console.error('Notification weather fetch error:', e.message);
    return null;
  }
}

async function dealItems(uid) {
  const items = [];
  try {
    const [lots, offers, payments, grievances] = await Promise.all([
      Lot.find({ farmerUid: uid }).sort({ createdAt: -1 }).limit(10).lean(),
      Offer.find({ farmerUid: uid }).sort({ createdAt: -1 }).limit(20).lean(),
      Payment.find({ farmerUid: uid }).sort({ createdAt: -1 }).limit(20).lean(),
      Grievance.find({ raisedByUid: uid }).sort({ updatedAt: -1 }).limit(5).lean(),
    ]);

    for (const p of payments) {
      const at = p.updatedAt || p.createdAt;
      if (p.status === 'RELEASED') {
        items.push({
          id: `pay_${p._id}_released`, kind: 'payment_released',
          params: { amount: Math.round(p.amount || 0).toLocaleString('en-IN') },
          title: 'Money received', message: `₹${Math.round(p.amount || 0).toLocaleString('en-IN')} is yours.`,
          type: 'success', category: 'deal', to: '/trade', createdAt: at,
        });
      } else if (p.status === 'HELD' || p.status === 'PENDING') {
        items.push({
          id: `pay_${p._id}_held`, kind: 'offer_accepted',
          params: { buyer: p.buyerName || 'buyer' },
          title: 'Buyer said YES', message: `${p.buyerName || 'The buyer'} accepted — money is held safe.`,
          type: 'success', category: 'deal', to: '/trade', createdAt: at,
        });
      } else if (p.status === 'CANCELLED') {
        items.push({
          id: `pay_${p._id}_failed`, kind: 'payment_failed', params: {},
          title: 'Payment failed', message: 'The buyer did not pay. Open Trade and raise an issue.',
          type: 'danger', category: 'deal', to: '/trade', createdAt: at,
        });
      }
    }

    const paidOfferIds = new Set(payments.map((p) => String(p.offerId || '')));
    for (const o of offers) {
      if (o.status === 'SENT' && !paidOfferIds.has(String(o._id))) {
        items.push({
          id: `offer_${o._id}_sent`, kind: 'offer_sent',
          params: { buyer: o.buyerName || 'buyer', crop: o.crop || '', qty: o.quantityQuintals ?? '' },
          title: 'Offer sent', message: `Waiting for ${o.buyerName || 'the buyer'}'s reply.`,
          type: 'info', category: 'deal', to: '/trade', createdAt: o.createdAt,
        });
      }
    }

    const engagedLotIds = new Set(
      offers
        .filter((o) => o.status === 'SENT' || o.status === 'ACCEPTED')
        .map((o) => String(o.lotId))
    );
    for (const l of lots) {
      if ((l.status === 'OPEN' || l.status === 'OFFERED') && !engagedLotIds.has(String(l._id))) {
        items.push({
          id: `lot_${l._id}_waiting`, kind: 'lot_waiting',
          params: { crop: l.crop || '', qty: l.quantity ?? '' },
          title: 'Lot waiting for a buyer', message: 'Pick a buyer in Trade to move it.',
          type: 'info', category: 'deal', to: '/trade', createdAt: l.createdAt,
        });
      }
    }

    for (const g of grievances.slice(0, 3)) {
      items.push({
        id: `griev_${g._id}_${g.status}`, kind: 'grievance_update',
        params: { status: String(g.status).replace(/_/g, ' ') },
        title: 'Issue update', message: `Your issue is now: ${String(g.status).replace(/_/g, ' ')}.`,
        type: 'warning', category: 'deal', to: '/trade', createdAt: g.updatedAt || g.createdAt,
      });
    }
  } catch (e) {
    console.error('Notification deal-events error:', e.message);
  }
  return items;
}

async function priceItems(uid) {
  try {
    const alerts = await PriceAlert.find({ userUid: uid, active: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    if (alerts.length === 0) return [];
    const history = priceHistory.loadHistory();
    return priceAlertItems(alerts, history.days);
  } catch (e) {
    console.error('Notification price-alert error:', e.message);
    return [];
  }
}

// GET /api/notifications - deal events + weather + tip (auth required)
router.get('/', authenticateUser, async (req, res) => {
  try {
    // Default to Nashik (canonical demo district) — never silently New Delhi.
    let lat = 19.9975;
    let lon = 73.7898;

    if (req.query.latitude && req.query.longitude) {
      lat = parseFloat(req.query.latitude);
      lon = parseFloat(req.query.longitude);
    }

    const day = dayKey();
    const [weather, deals, prices] = await Promise.all([
      fetchWeather(lat, lon),
      dealItems(req.user.uid),
      priceItems(req.user.uid),
    ]);

    const notifications = [
      ...deals.sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0)).slice(0, 8),
      ...prices,
      ...weatherItems(weather, day),
      {
        id: `tip_${day}`, kind: 'tip', params: {},
        title: 'Farm tip',
        message: 'Walk your fields once a week — catching pests early saves the crop.',
        type: 'info', category: 'tip', to: '/advisory', createdAt: `${day}T00:00:00.000Z`,
      },
    ].slice(0, 14);

    res.json({
      success: true,
      notifications,
      unreadCount: notifications.length,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// ── Price-alert subscriptions ──────────────────────────────────────────────
// Observed-price triggers only: when the latest AGMARKNET modal in
// priceHistory crosses the target, GET /api/notifications derives a
// per-day-stable item. No forecasts, no writes on read.

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/price-alerts', authenticateUser, requireDb, async (req, res) => {
  try {
    const alerts = await PriceAlert.find({ userUid: req.user.uid })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list price alerts' });
  }
});

router.post('/price-alerts', authenticateUser, requireDb, async (req, res) => {
  try {
    const { errors, clean } = validatePriceAlertInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }
    const existing = await PriceAlert.findOne({
      userUid: req.user.uid,
      active: true,
      direction: clean.direction,
      targetPrice: clean.targetPrice,
      crop: new RegExp(`^${escapeRegex(clean.crop)}$`, 'i'),
      market: new RegExp(`^${escapeRegex(clean.market)}$`, 'i'),
    });
    if (existing) {
      return res.json({ success: true, alert: existing, existing: true });
    }
    const alert = await PriceAlert.create({ userUid: req.user.uid, ...clean, active: true });
    res.status(201).json({ success: true, alert });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create price alert' });
  }
});

router.patch('/price-alerts/:id', authenticateUser, requireDb, async (req, res) => {
  try {
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'active must be a boolean' });
    }
    const alert = await PriceAlert.findOneAndUpdate(
      { _id: req.params.id, userUid: req.user.uid },
      { $set: { active } },
      { new: true },
    );
    if (!alert) return res.status(404).json({ success: false, error: 'Price alert not found' });
    res.json({ success: true, alert });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Price alert not found' });
    res.status(500).json({ success: false, error: 'Failed to update price alert' });
  }
});

router.delete('/price-alerts/:id', authenticateUser, requireDb, async (req, res) => {
  try {
    const result = await PriceAlert.deleteOne({ _id: req.params.id, userUid: req.user.uid });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Price alert not found' });
    res.json({ success: true, deleted: true });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Price alert not found' });
    res.status(500).json({ success: false, error: 'Failed to delete price alert' });
  }
});

// GET /api/notifications/digest - Get daily weather digest (no auth needed)
router.get('/digest', async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const weather = await fetchWeather(parseFloat(latitude), parseFloat(longitude));
    const weatherAlerts = weatherItems(weather, dayKey())
      .map((a) => ({ id: a.id, title: a.title, message: a.message, type: a.type, category: a.category, read: false, createdAt: a.createdAt }));
    res.json({ alerts: weatherAlerts, count: weatherAlerts.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate digest' });
  }
});

module.exports = router;
