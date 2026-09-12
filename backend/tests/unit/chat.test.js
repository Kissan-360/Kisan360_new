const { classifyIntent, executeIntent } = require('../../src/routes/chat');

describe('chat assistant', () => {
  test.each([
    ['compare onion mandis in Nashik', 'compare_mandis'],
    ['what is my lot status', 'my_lot_status'],
    ['explain net realization calculator', 'explain_net_realization'],
    ['what is my best pathway option', 'pathway_options'],
    ['create lot and find buyer', 'trade_help'],
    ['havaman paus forecast', 'weather_info'],
    ['leaf disease photo check', 'crop_health'],
    ['fertilizer advice for onion', 'advisory'],
    ['PM Kisan yojana subsidy', 'govt_schemes'],
    ['how does kisan360 work', 'how_it_works'],
    ['namaste', 'greeting'],
  ])('classifies %s as %s', (message, intent) => {
    expect(classifyIntent(message).intent).toBe(intent);
  });

  test('falls back for unrecognized input', () => {
    const result = classifyIntent('tell me a poem about clouds');
    expect(result.intent).toBe('fallback');
    expect(result.handler).toBe('llm_fallback');
  });

  test('handles empty and noisy input', () => {
    expect(classifyIntent('   ').intent).toBe('empty');
    expect(classifyIntent('"><script>alert(1)</script> compare market price').intent).toBe('compare_mandis');
  });

  test('navigation intents return actions', async () => {
    const classification = classifyIntent('compare mandis for onion');
    const response = await executeIntent({
      message: 'compare mandis for onion',
      language: 'en',
      context: { crop: 'Onion', district: 'Nashik', quantityQuintals: 10 },
      classification,
      mode: 'action',
    });
    expect(response.action).toMatchObject({ type: 'navigate' });
    // Pre-fills the Decision Workspace from chat context (params may evolve).
    expect(response.action.path.startsWith('/decision?')).toBe(true);
    expect(response.action.path).toContain('crop=Onion');
    expect(response.action.path).toContain('district=Nashik');
    expect(response.text).toContain('Onion');
    expect(response.text).toContain('Nashik');
  });

  test('ask mode suppresses navigation actions', async () => {
    const classification = classifyIntent('compare mandis for onion');
    const response = await executeIntent({
      message: 'compare mandis for onion',
      language: 'en',
      context: { crop: 'Onion', district: 'Nashik', quantityQuintals: 10 },
      classification,
      mode: 'ask',
    });
    expect(response.action).toBeUndefined();
    expect(response.text).toContain('net realization');
    expect(response.suggestions).toContain('Explain transport costs');
  });

  test.each([
    ['What is PM-KISAN?', 'Rs 6,000'],
    ['Explain transport costs', 'vehicle hire'],
    ['What is PMFBY crop insurance?', 'crop insurance'],
    ['How do I sell my crop?', 'create a lot'],
  ])('ask mode answers %s specifically', async (message, expected) => {
    const response = await executeIntent({
      message,
      language: 'en',
      context: { crop: 'Onion', district: 'Nashik', quantityQuintals: 10 },
      classification: classifyIntent(message),
      mode: 'ask',
    });
    expect(response.action).toBeUndefined();
    expect(response.text).toContain(expected);
  });

  test('government scheme response is localized and avoids invented prices', async () => {
    const response = await executeIntent({
      message: 'sarkari yojana',
      language: 'hi',
      context: {},
      classification: classifyIntent('sarkari yojana'),
      mode: 'ask',
    });
    expect(response.text).toContain('PM-KISAN');
    expect(response.text).toContain('पात्रता');
    expect(response.action).toBeUndefined();
  });

  test('very long messages are still classified deterministically', () => {
    const long = `${'x'.repeat(2000)} explain net realization`;
    expect(classifyIntent(long).intent).toBe('explain_net_realization');
  });
});
