const { MACHINES, canTransition, allowedTransitions, transition } = require('../../src/services/stateMachine');

describe('stateMachine', () => {
  test('payment: PENDING → HELD → RELEASED is legal', () => {
    const p = { status: 'PENDING', history: [] };
    expect(canTransition('payment', 'PENDING', 'HELD')).toBe(true);
    transition('payment', p, 'HELD', { by: 'buyer-demo' });
    expect(p.status).toBe('HELD');
    expect(p.history).toHaveLength(1);
    expect(p.history[0].by).toBe('buyer-demo');

    transition('payment', p, 'RELEASED', { by: 'buyer-demo', note: 'settled' });
    expect(p.status).toBe('RELEASED');
    expect(p.history).toHaveLength(2);
    expect(p.history[1].note).toBe('settled');
  });

  test('payment: illegal jumps and reversed transitions throw', () => {
    expect(() => transition('payment', { status: 'PENDING', history: [] }, 'RELEASED')).toThrow(/Illegal transition/);
    const p = { status: 'HELD', history: [] };
    expect(() => transition('payment', p, 'PENDING')).toThrow();
    expect(() => transition('payment', { status: 'RELEASED', history: [] }, 'HELD')).toThrow();
  });

  test('payment: CANCELLED allowed only from PENDING/HELD', () => {
    expect(canTransition('payment', 'PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('payment', 'HELD', 'CANCELLED')).toBe(true);
    expect(canTransition('payment', 'RELEASED', 'CANCELLED')).toBe(false);
  });

  test('offer: SENT may accept/reject/withdraw/expire, nothing after ACCEPTED', () => {
    expect(canTransition('offer', 'SENT', 'ACCEPTED')).toBe(true);
    expect(canTransition('offer', 'SENT', 'REJECTED')).toBe(true);
    expect(canTransition('offer', 'SENT', 'WITHDRAWN')).toBe(true);
    expect(canTransition('offer', 'ACCEPTED', 'REJECTED')).toBe(false);
    const o = { status: 'SENT', history: [] };
    transition('offer', o, 'ACCEPTED', { by: 'buyer' });
    expect(o.status).toBe('ACCEPTED');
    expect(() => transition('offer', o, 'REJECTED')).toThrow();
  });

  test('illegal transition carries from/to for a 422 response', () => {
    try {
      transition('payment', { status: 'PENDING', history: [] }, 'RELEASED');
      throw new Error('should not reach');
    } catch (err) {
      expect(err.code).toBe('ILLEGAL_TRANSITION');
      expect(err.from).toBe('PENDING');
      expect(err.to).toBe('RELEASED');
    }
  });

  test('allowedTransitions reports legal next states', () => {
    expect(allowedTransitions('payment', 'HELD').sort()).toEqual(['CANCELLED', 'RELEASED']);
    expect(allowedTransitions('payment', 'RELEASED')).toEqual([]);
    expect(MACHINES.payment.initial).toBe('PENDING');
    expect(MACHINES.offer.initial).toBe('SENT');
  });
});
