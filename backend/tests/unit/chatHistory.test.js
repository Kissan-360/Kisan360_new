// Chat history persistence — model shape only (DB is memory-backed in CI,
// so we assert the endpoint contract, not Atlas durability).
const mongoose = require('mongoose');

describe('ChatHistory model', () => {
  test('schema caps text and indexes by user + date', () => {
    const ChatHistory = require('../../src/models/ChatHistory');
    const schema = ChatHistory.schema;
    expect(schema.path('text').options.maxlength).toBe(5000);
    expect(schema.indexes().some(([f]) => f.userUid === 1 && f.createdAt === -1)).toBe(true);
    const ttl = schema.indexes().find(([f, opts]) => opts && opts.expireAfterSeconds === 90 * 24 * 3600);
    expect(ttl).toBeTruthy();
  });

  test('rejects invalid role', async () => {
    const ChatHistory = require('../../src/models/ChatHistory');
    const doc = new ChatHistory({ userUid: 'u1', role: 'system', text: 'hi' });
    const err = doc.validateSync();
    expect(err).toBeTruthy();
    expect(err.errors.role).toBeTruthy();
    expect(mongoose.isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });
});
