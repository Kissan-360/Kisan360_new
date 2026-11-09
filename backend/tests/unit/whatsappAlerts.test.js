// WhatsApp weather-alert thresholds — pure logic, no Cloud API in CI
const { shouldAlert } = require('../../src/services/whatsappAlerts');

describe('whatsappAlerts thresholds', () => {
  test('heat wave triggers', async () => {
    expect(await shouldAlert({ current: { temperature: 41, humidity: 30, condition: 'Sunny' } })).toMatch(/Heat wave/i);
  });

  test('humidity triggers', async () => {
    expect(await shouldAlert({ current: { temperature: 32, humidity: 88, condition: 'Cloudy' } })).toMatch(/humidity/i);
  });

  test('rain triggers', async () => {
    expect(await shouldAlert({ current: { temperature: 28, humidity: 70, condition: 'Rain' } })).toMatch(/Rain/i);
  });

  test('mild weather does not alert', async () => {
    expect(await shouldAlert({ current: { temperature: 28, humidity: 60, condition: 'Cloudy' } })).toBeNull();
  });
});
