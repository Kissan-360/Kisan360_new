// Scheduler WhatsApp alerts — threshold + auto-send contract (no Cloud API in CI)
const { shouldAlert } = require('../../src/services/whatsappAlerts');

describe('weather alert auto-send thresholds', () => {
  test('severe heat sends, mild does not', async () => {
    expect(await shouldAlert({ current: { temperature: 42, humidity: 20, condition: 'Sunny' } })).toMatch(/Heat wave/i);
    expect(await shouldAlert({ current: { temperature: 28, humidity: 60, condition: 'Cloudy' } })).toBeNull();
  });
});
