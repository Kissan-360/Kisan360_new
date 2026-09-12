/**
 * /api/trading-channels — digital trading channels directory (eNAM, APMC e-auctions, FPO digital programs).
 *
 * Closes the problem-statement leg "digital trading channels": price discovery venues
 * beyond the local physical auction lane. Data is a labeled DEMO directory
 * (classification: DEMO_CHANNEL) — fees and rules must be verified on the official portal.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_FILE = path.join(__dirname, '..', 'data', 'tradingChannels.json');

function loadChannels() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    require('../utils/logger').error('[tradingChannels] Failed to load data file:', err.message);
    return { meta: { note: 'Trading channels unavailable.', classification: 'DEMO_CHANNEL' }, channels: [] };
  }
}

// GET /api/trading-channels?crop=Onion
router.get('/', (req, res) => {
  try {
    const data = loadChannels();
    const crop = (req.query.crop || '').toString().trim().toLowerCase();

    let channels = data.channels || [];
    if (crop) {
      channels = channels.filter((c) =>
        Array.isArray(c.crops) && (c.crops.includes('all') || c.crops.some((x) => x.toLowerCase() === crop))
      );
    }

    res.json({
      success: true,
      count: channels.length,
      classification: data.meta?.classification || 'DEMO_CHANNEL',
      channels,
    });
  } catch (err) {
    require('../utils/logger').error('[tradingChannels] Handler failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load trading channels.' });
  }
});

module.exports = router;
