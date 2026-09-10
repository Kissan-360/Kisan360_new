const { canTransition, transition, allowedTransitions } = require('../../src/services/stateMachine');

describe('grievance state machine (HLD: Raise → Open → Under Review → Resolved)', () => {
  test('OPEN → UNDER_REVIEW → RESOLVED is the happy path', () => {
    const g = { status: 'OPEN', history: [] };
    expect(canTransition('grievance', 'OPEN', 'UNDER_REVIEW')).toBe(true);
    transition('grievance', g, 'UNDER_REVIEW', { by: 'fpo-demo', note: 'picked up' });
    expect(g.status).toBe('UNDER_REVIEW');
    transition('grievance', g, 'RESOLVED', { by: 'fpo-demo', note: 'payment tracked' });
    expect(g.status).toBe('RESOLVED');
    expect(g.history).toHaveLength(2);
    expect(g.history[1].note).toBe('payment tracked');
  });

  test('OPEN → RESOLVED directly is allowed (quick fix)', () => {
    expect(canTransition('grievance', 'OPEN', 'RESOLVED')).toBe(true);
  });

  test('OPEN → REJECTED and UNDER_REVIEW → REJECTED are allowed', () => {
    expect(canTransition('grievance', 'OPEN', 'REJECTED')).toBe(true);
    expect(canTransition('grievance', 'UNDER_REVIEW', 'REJECTED')).toBe(true);
  });

  test('illegal jumps and reversals throw', () => {
    expect(() => transition('grievance', { status: 'RESOLVED', history: [] }, 'UNDER_REVIEW')).toThrow(/Illegal transition/);
    expect(() => transition('grievance', { status: 'REJECTED', history: [] }, 'RESOLVED')).toThrow(/Illegal transition/);
    expect(canTransition('grievance', 'RESOLVED', 'REJECTED')).toBe(false);
  });

  // ── Expanded tests ────────────────────────────────────────────────────────

  test('RESOLVED and REJECTED are terminal — no transitions allowed', () => {
    expect(allowedTransitions('grievance', 'RESOLVED')).toEqual([]);
    expect(allowedTransitions('grievance', 'REJECTED')).toEqual([]);
  });

  test('OPEN allows UNDER_REVIEW, RESOLVED, and REJECTED', () => {
    const open = allowedTransitions('grievance', 'OPEN');
    expect(open).toContain('UNDER_REVIEW');
    expect(open).toContain('RESOLVED');
    expect(open).toContain('REJECTED');
    expect(open).toHaveLength(3);
  });

  test('UNDER_REVIEW allows RESOLVED and REJECTED', () => {
    const review = allowedTransitions('grievance', 'UNDER_REVIEW');
    expect(review).toContain('RESOLVED');
    expect(review).toContain('REJECTED');
    expect(review).toHaveLength(2);
  });

  test('history entries track from/to/by/note correctly', () => {
    const g = { status: 'OPEN', history: [] };
    transition('grievance', g, 'UNDER_REVIEW', { by: 'reviewer-1', note: 'checking' });
    transition('grievance', g, 'RESOLVED', { by: 'reviewer-2', note: 'fixed' });
    expect(g.history[0]).toMatchObject({ from: 'OPEN', to: 'UNDER_REVIEW', by: 'reviewer-1', note: 'checking' });
    expect(g.history[1]).toMatchObject({ from: 'UNDER_REVIEW', to: 'RESOLVED', by: 'reviewer-2', note: 'fixed' });
    expect(g.history[0].at).toBeDefined();
    expect(g.history[1].at).toBeDefined();
  });

  test('REJECTED history shows correct chain', () => {
    const g = { status: 'OPEN', history: [] };
    transition('grievance', g, 'UNDER_REVIEW', { by: 'reviewer', note: 'reviewed' });
    transition('grievance', g, 'REJECTED', { by: 'reviewer', note: 'not valid' });
    expect(g.status).toBe('REJECTED');
    expect(g.history).toHaveLength(2);
    expect(g.history[1].to).toBe('REJECTED');
  });

  test('illegal transition from REJECTED to any state throws', () => {
    expect(() => transition('grievance', { status: 'REJECTED', history: [] }, 'OPEN')).toThrow(/Illegal transition/);
    expect(() => transition('grievance', { status: 'REJECTED', history: [] }, 'UNDER_REVIEW')).toThrow(/Illegal transition/);
    expect(() => transition('grievance', { status: 'REJECTED', history: [] }, 'RESOLVED')).toThrow(/Illegal transition/);
  });

  test('unknown state machine name throws', () => {
    expect(() => canTransition('nonexistent', 'OPEN', 'CLOSED')).toThrow(/Unknown state machine/);
  });
});
