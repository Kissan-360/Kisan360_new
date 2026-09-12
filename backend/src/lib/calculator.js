/**
 * calculator.js — shared knobs for talking to the net-realization engine.
 *
 * Free-tier hosting sleeps the calculator after ~15 min idle; the first
 * request wakes it in ~30-60 s. A short axios timeout turns that wake-up into
 * a red error card, so engine calls use a wake-tolerant timeout and map a
 * lapsed timeout (ECONNABORTED) to an honest "waking up, retry" 503 instead
 * of a generic 500.
 */
const axios = require('axios');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';

// 90 s: covers a cold start plus a slow compute; a truly dead host fails fast
// (refused/DNS) long before this elapses, so honest 503s are not delayed.
const CALC_TIMEOUT_MS = 90000;

function calcUrl(path) {
  return `${NET_REALIZATION_URL}${path}`;
}

async function calcPost(path, body) {
  const res = await axios.post(calcUrl(path), body, { timeout: CALC_TIMEOUT_MS });
  return res.data;
}

async function calcGet(path) {
  const res = await axios.get(calcUrl(path), { timeout: CALC_TIMEOUT_MS });
  return res.data;
}

// True when the engine didn't answer in time — on free-tier hosting this
// almost always means it is waking from sleep, not that it is broken.
function isColdStart(error) {
  return error && (error.code === 'ECONNABORTED' || (typeof error.message === 'string' && /timeout/i.test(error.message)));
}

function coldStartMessage() {
  return 'Price engine is waking up (cold start after idle) — wait about a minute and try again.';
}

module.exports = { NET_REALIZATION_URL, CALC_TIMEOUT_MS, calcPost, calcGet, isColdStart, coldStartMessage };
