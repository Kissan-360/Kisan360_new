// Scheduler WhatsApp auto-send — no-ops gracefully without keys/phones (in-CI)
describe('scheduler weather alerts auto-send', () => {
  test('runWeatherAlerts is exported and no-ops without keys', async () => {
    const oldWa = process.env.WHATSAPP_TOKEN;
    const oldWeather = process.env.OPENWEATHER_API_KEY;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.OPENWEATHER_API_KEY;
    const scheduler = require('../../src/services/scheduler');
    expect(typeof scheduler.runWeatherAlerts).toBe('function');
    // Should not throw when keys are missing (skips with info log)
    await expect(scheduler.runWeatherAlerts()).resolves.toBeUndefined();
    if (oldWa) process.env.WHATSAPP_TOKEN = oldWa;
    if (oldWeather) process.env.OPENWEATHER_API_KEY = oldWeather;
  });
});
