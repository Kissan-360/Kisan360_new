/**
 * jest.config.js — determinism for a suite that boots real processes.
 *
 * This suite is unusual: seven integration files each spawn a REAL Express
 * server plus a memory MongoDB. So the limit is processes and memory, not CPU
 * cores, and jest's default of one worker per core let the box oversubscribe.
 * The symptom was unmistakable once seen: six suites failing *entirely* (~76
 * tests, ~12 each) because their shared beforeAll never saw a healthy server —
 * an intermittent 76-failure run followed by an identical all-green run, with
 * a message ("did not become healthy") that named no cause.
 *
 * Two changes make runs reproducible:
 *   • maxWorkers is bounded, so at most a few servers + databases exist at once;
 *   • testTimeout is generous, because a busy machine is not a broken app.
 *
 * The app was never at fault here — but a suite that fails 1 run in 3 cannot
 * support a "qualified" claim, and it would have failed CI's first real push.
 */

module.exports = {
  testEnvironment: 'node',
  // Bounded by process count, not cores. CI runners have 2 cores and little RAM.
  maxWorkers: process.env.CI ? 2 : '50%',
  testTimeout: 120000,
  testMatch: ['**/tests/**/*.test.js'],
};
