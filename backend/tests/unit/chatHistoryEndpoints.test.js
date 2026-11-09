// Chat history persistence — model + route shape (no DB in unit, uses memory fallback in CI)
describe('chat history persistence', () => {
  const ChatHistory = require('../../src/models/ChatHistory');
  test('model validates user+assistant turns', () => {
    const user = new ChatHistory({ userUid: 'u1', role: 'user', text: 'Compare mandis for onion' });
    const assistant = new ChatHistory({ userUid: 'u1', role: 'assistant', text: 'Best is Lasalgaon' });
    expect(user.validateSync()).toBeUndefined();
    expect(assistant.validateSync()).toBeUndefined();
  });

  test('model rejects empty text', () => {
    const doc = new ChatHistory({ userUid: 'u1', role: 'user', text: '' });
    const err = doc.validateSync();
    expect(err).toBeTruthy();
  });
});
