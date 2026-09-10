const express = require('express');
const axios = require('axios');
const { authenticateUser } = require('../middleware/auth');
const router = express.Router();

const generateNotifications = async (lat, lon) => {
  const alerts = [];

  try {
    const wRes = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather`,
      {
        params: {
          lat, lon,
          appid: process.env.OPENWEATHER_API_KEY,
          units: 'metric',
        },
        timeout: 5000,
      }
    );

    const c = wRes.data;
    const temp = c.main.temp;
    const humidity = c.main.humidity;
    const now = new Date().toISOString();

    if (temp > 40) {
      alerts.push({
        id: 'heat_' + now,
        title: 'Heatwave Alert',
        message: `Temperature is ${Math.round(temp)}°C — take precautions to protect crops and livestock. Increase irrigation.`,
        type: 'danger',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    } else if (temp > 35) {
      alerts.push({
        id: 'warm_' + now,
        title: 'High Temperature Warning',
        message: `Temperature at ${Math.round(temp)}°C. Monitor soil moisture and consider shade for sensitive crops.`,
        type: 'warning',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    }

    if (humidity > 85) {
      alerts.push({
        id: 'humidity_' + now,
        title: 'High Humidity Alert',
        message: `Humidity at ${humidity}% — high risk of fungal diseases. Apply preventive fungicide and improve air circulation.`,
        type: 'warning',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    } else if (humidity < 25) {
      alerts.push({
        id: 'dry_' + now,
        title: 'Low Humidity Warning',
        message: `Humidity at ${humidity}% — increased risk of pest infestation. Monitor for thrips and mites.`,
        type: 'warning',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    }

    if (c.rain?.['1h'] || c.rain?.['3h']) {
      alerts.push({
        id: 'rain_' + now,
        title: 'Rain Alert',
        message: 'Rain detected. Delay fertilizer and pesticide applications. Ensure field drainage is working.',
        type: 'info',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    }

    if (c.weather?.[0]?.main === 'Thunderstorm') {
      alerts.push({
        id: 'storm_' + now,
        title: 'Thunderstorm Warning',
        message: 'Thunderstorm detected. Seek shelter, disconnect irrigation equipment. Secure loose farm objects.',
        type: 'danger',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    }

    if (temp < 5) {
      alerts.push({
        id: 'frost_' + now,
        title: 'Frost Alert',
        message: `Temperature at ${Math.round(temp)}°C — frost risk. Cover seedlings, irrigate before nightfall.`,
        type: 'danger',
        category: 'weather',
        read: false,
        createdAt: now,
      });
    }
  } catch (e) {
    console.error('Notification weather fetch error:', e.message);
  }

  alerts.push({
    id: 'tip_' + Date.now(),
    title: 'Farm Tip',
    message: 'Regular scouting of fields helps catch pest and disease problems early. Walk your fields at least once a week.',
    type: 'info',
    category: 'tip',
    read: false,
    createdAt: new Date().toISOString(),
  });

  return alerts;
};

// GET /api/notifications - Get user notifications (auth required)
router.get('/', authenticateUser, async (req, res) => {
  try {
    // Default to Nashik (canonical demo district) — never silently New Delhi.
    let lat = 19.9975, lon = 73.7898;

    if (req.query.latitude && req.query.longitude) {
      lat = parseFloat(req.query.latitude);
      lon = parseFloat(req.query.longitude);
    }

    const notifications = await generateNotifications(lat, lon);

    res.json({
      success: true,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/digest - Get daily weather digest (no auth needed)
router.get('/digest', async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const alerts = await generateNotifications(
      parseFloat(latitude),
      parseFloat(longitude)
    );

    const weatherAlerts = alerts.filter((a) => a.category === 'weather');
    res.json({ alerts: weatherAlerts, count: weatherAlerts.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate digest' });
  }
});

module.exports = router;
