// Scheduler WhatsApp auto-send — contract (no Cloud, no DB in unit)
const { shouldAlert } = require('../../src/services/whatsappAlerts');

describe('scheduler weather alerts auto-send contract', () => {
  test('severe heat produces a sendable alert', async () => {
    const msg = await shouldAlert({ current: { temperature: 42, humidity: 20, condition: 'Sunny' } });
    expect(msg).toMatch(/Heat wave/i);
  });

  test('mild weather produces no alert (no spam)', async () => {
    expect(await shouldAlert({ current: { temperature: 26, humidity: 50, condition: 'Clear' } })).toBeNull();
  });

  test('scheduler exposes runWeatherAlerts (opt-in, env-gated)', () => {
    const scheduler = require('../../src/services/scheduler');
    expect(typeof scheduler.runWeatherAlerts).toBe('function');
  });
});
