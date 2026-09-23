const mongoose = require('mongoose');

// One milestone, no identity.
//
// Deliberately absent: uid, name, phone, email, ip, user agent, price, quantity,
// any free text. A pilot report needs counts by milestone and distinct devices;
// anything beyond that is a liability with no analytical payoff. See
// src/lib/usageEvents.js for the whitelist that builds these records.
const usageEventSchema = new mongoose.Schema({
  event: { type: String, required: true, index: true },
  at: { type: Date, required: true, default: Date.now, index: true },
  role: { type: String, default: 'anonymous' },
  district: { type: String, default: null },
  locale: { type: String, default: null },
  // Random per-browser id so "how many devices" is answerable. Not an account,
  // not a session fingerprint, cleared with browser storage.
  installId: { type: String, default: null, index: true },
}, { versionKey: false });

// Pilot reports query by window and group by milestone.
usageEventSchema.index({ at: -1, event: 1 });

module.exports = mongoose.model('UsageEvent', usageEventSchema);
