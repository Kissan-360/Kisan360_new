// The milestone mapping and the privacy contract for pilot telemetry.
//
// Two things must never quietly change: which requests count as milestones
// (a wrong mapping produces a report that overstates the pilot) and what a
// record may contain (a field added here is a field collected about a real
// farmer).

const {
  MILESTONES,
  ALLOWED_EVENTS,
  milestoneFor,
  isTelemetryEnabled,
  buildRecord,
  sessionIdentityFromBody,
} = require('../../src/lib/usageEvents');

describe('usage telemetry — milestones', () => {
  test('recognises the milestones a pilot report is built from', () => {
    expect(milestoneFor('GET', '/api/market/net-realization?crop=Onion&district=Nashik')).toBe('decision_run');
    expect(milestoneFor('POST', '/api/auth/demo-login')).toBe('session_started');
    expect(milestoneFor('POST', '/api/lots')).toBe('lot_created');
    expect(milestoneFor('POST', '/api/lots?x=1')).toBe('lot_created');
    expect(milestoneFor('POST', '/api/grade-assessment')).toBe('grade_submitted');
    expect(milestoneFor('POST', '/api/offers')).toBe('offer_sent');
    expect(milestoneFor('POST', '/api/offers/64b000000000000000000000/accept')).toBe('offer_accepted');
    expect(milestoneFor('POST', '/api/payments/64b000000000000000000000/simulate-release')).toBe('payment_released');
    expect(milestoneFor('POST', '/api/payments/64b000000000000000000000/simulate-failure')).toBe('payment_failed');
    expect(milestoneFor('POST', '/api/grievances')).toBe('grievance_raised');
  });

  test('ordinary traffic is not recorded at all', () => {
    // A request that is not a milestone must leave no trace — this is the
    // difference between a pilot report and surveillance.
    for (const [m, p] of [
      ['GET', '/health'],
      ['GET', '/api/market/prices'],
      ['GET', '/api/buyers'],
      ['GET', '/api/lots'],
      ['GET', '/api/lots/64b000000000000000000000'],
      ['POST', '/api/chat'],
      ['PUT', '/api/community/topics/64b000000000000000000000'],
      ['POST', '/api/community/topics/anyid/comments'],
      ['DELETE', '/api/lots/64b000000000000000000000'],
      ['POST', '/api/payments/64b000000000000000000000/release'],
    ]) {
      expect(milestoneFor(m, p)).toBeNull();
    }
  });

  test('method matters — a read is not a write', () => {
    expect(milestoneFor('GET', '/api/lots')).toBeNull();
    expect(milestoneFor('POST', '/api/lots')).toBe('lot_created');
    // Express hands over uppercase methods; tolerating lowercase is harmless
    // and avoids a silent miss if that ever changes.
    expect(milestoneFor('post', '/api/lots')).toBe('lot_created');
  });

  test('a query string does not change the answer', () => {
    expect(milestoneFor('POST', '/api/lots?a=b&c=d')).toBe('lot_created');
    expect(milestoneFor('GET', '/api/market/net-realization?crop=Onion&district=Nashik&quantity=10')).toBe('decision_run');
  });
});

describe('usage telemetry — privacy', () => {
  afterEach(() => { delete process.env.KISAN_TELEMETRY; });

  test('collection is off unless explicitly enabled', () => {
    delete process.env.KISAN_TELEMETRY;
    expect(isTelemetryEnabled()).toBe(false);
    process.env.KISAN_TELEMETRY = 'off';
    expect(isTelemetryEnabled()).toBe(false);
    process.env.KISAN_TELEMETRY = 'on';
    expect(isTelemetryEnabled()).toBe(true);
  });

  test('a record carries the coarse fields and nothing identifying', () => {
    const record = buildRecord({
      event: 'lot_created',
      user: { uid: 'demo-farmer', role: 'farmer', name: 'Ramesh Patil', district: 'Nashik' },
      locale: 'mr-IN,mr;q=0.9',
      installId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(record.event).toBe('lot_created');
    expect(record.role).toBe('farmer');
    expect(record.district).toBe('Nashik');
    expect(record.installId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

    // The point of the whitelist: identity fields cannot leak in even when the
    // caller passes an object that has them.
    const serialised = JSON.stringify(record);
    expect(serialised).not.toContain('demo-farmer');
    expect(serialised).not.toContain('Ramesh');
    expect(Object.keys(record).sort()).toEqual(['at', 'district', 'event', 'installId', 'locale', 'role']);
  });

  test('unknown events are refused rather than stored', () => {
    expect(buildRecord({ event: 'not_a_milestone', user: { role: 'farmer' } })).toBeNull();
    expect(ALLOWED_EVENTS).toEqual(MILESTONES.map((m) => m.event));
  });

  test('an install id is sanitised, and long input cannot bloat a record', () => {
    const record = buildRecord({
      event: 'decision_run',
      user: { role: 'farmer', district: 'x'.repeat(200) },
      installId: '<script>alert(1)</script>',
    });
    expect(record.installId).toBe('scriptalert1script');
    expect(record.district.length).toBeLessThanOrEqual(40);
  });
});

describe('usage telemetry — the session milestone', () => {
  test('records the role the login is about to mint, not `anonymous`', () => {
    // The login carries no token (it is requesting one), so without this the
    // headline pilot number — farmer sessions — would be unanswerable.
    const user = sessionIdentityFromBody({ body: { role: 'farmer', district: 'Nashik' } });
    expect(user).toEqual({ role: 'farmer', district: 'Nashik' });
    expect(buildRecord({ event: 'session_started', user }).role).toBe('farmer');
  });

  test('falls back to the demo profile district, like demo-login does', () => {
    expect(sessionIdentityFromBody({ body: { role: 'buyer' } })).toEqual({ role: 'buyer', district: 'Mumbai' });
  });

  test('an unknown or missing role resolves to the same default the server mints', () => {
    // normalizeRole's allow-list default is `farmer`; disagreeing with it here
    // would report sessions under a role their tokens never had.
    expect(sessionIdentityFromBody({ body: { role: 'superadmin' } }).role).toBe('farmer');
    expect(sessionIdentityFromBody({}).role).toBe('farmer');
    expect(sessionIdentityFromBody(null).role).toBe('farmer');
  });

  test('still cannot smuggle identity in through the login body', () => {
    const user = sessionIdentityFromBody({ body: { role: 'farmer', uid: 'demo-admin', name: 'Ramesh Patil' } });
    expect(Object.keys(user).sort()).toEqual(['district', 'role']);
    const serialised = JSON.stringify(buildRecord({ event: 'session_started', user }));
    expect(serialised).not.toContain('demo-admin');
    expect(serialised).not.toContain('Ramesh');
  });
});
