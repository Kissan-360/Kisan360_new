#!/usr/bin/env node
/**
 * seed-demo.js — put the demo into a mid-journey state so the presenter can
 * start anywhere in the run of show. Thin CLI wrapper around the shared
 * seeder (src/lib/demoSeed.js), which is also used by the server's startup
 * auto-seed when the in-memory demo DB is empty.
 *
 * Idempotent in the useful direction: re-running creates a fresh farmer
 * scenario each time; existing data is left alone.
 *
 * Usage (from backend/):  node scripts/seed-demo.js [baseUrl]
 * Env: none required (demo auth is self-contained).
 */
const { seedDemoScenario } = require('../src/lib/demoSeed');

const BASE = process.argv[2] || 'http://localhost:5000/api';

seedDemoScenario({ baseUrl: BASE, log: (m) => console.log(`✓ ${m}`) })
  .then(() => {
    console.log('\nDemo ready. Canonical run of show:');
    console.log('  1. /dashboard → Run canonical scenario (Onion · 10 q · Nashik) → calculator');
    console.log('  2. /net-realization → WITHOUT/WITH card → Why? drawer → what-if 50 q flip');
    console.log('  3. "Sell at <best mandi> — create lot →" → /trade pre-filled → matched buyers (Matched because ✓) → offer →');
    console.log('  4. switch to buyer demo login → Accept → release funds → PaymentOutcome + receipt');
    console.log('     (or stay on the farmer screen: Simulate Next Step walks accept → escrow → cash)');
    console.log('  5. /fpo → crop follows the decision → individual vs pooled uplift');
    console.log('  Reset any time: node scripts/seed-demo.js  (or the Dashboard demo-controls card)');
  })
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
