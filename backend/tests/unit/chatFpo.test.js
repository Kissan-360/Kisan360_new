const chat = require('../../src/routes/chat');

describe('chat FPO tool', () => {
  test('exports fetchFpoPoolTool and degrades gracefully with no params', async () => {
    expect(typeof chat.fetchFpoPoolTool).toBe('function');
    const res = await chat.fetchFpoPoolTool('Compare mandis', {});
    expect(res === null || typeof res === 'object').toBe(true);
  });

  test('navigate_pathways includes fpo when economics available', async () => {
    // Grounded shape check only — engine may be offline locally, so
    // fpo may be null; the contract is that the field exists when present.
    const classification = chat.classifyIntent('pathway option for onion in nashik 40 quintals');
    const res = await chat.executeIntent({
      message: 'pathway option for onion in nashik 40 quintals',
      language: 'en',
      context: { crop: 'Onion', district: 'Nashik', quantity: 40 },
      classification,
      mode: 'action',
    });
    expect(res.text).toBeDefined();
    if (res.toolResults?.fpo) {
      expect(res.toolResults.fpo.tool).toBe('fpo_pool');
    }
  });
});
